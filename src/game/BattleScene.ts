/**
 * 战斗场景组装（game/BattleScene.ts）—— 把 sim + anim + render 连接起来。
 *
 * 阶段 1：程序化战场地图（草地/道路/营地/水塘/装饰）+ 带边界限制的相机
 *         （滚轮缩放/拖拽/键盘平移）+ 单位贴地阴影 + 鼠标世界坐标。
 * 阶段 0 能力保留：长枪兵自动巡逻 + 自动攻击命中帧闪白震屏 + 死亡溶解 + 调试面板。
 */
import { ANIM_EVENTS } from '../anim/events';
import { AnimationPlayer } from '../anim/dragonbones';
import { AnimationStateMachine, type AnimStateMap } from '../anim/stateMachine';
import { generateSpearmanAssets } from '../art/generate';
import { Loop } from '../core/loop';
import { generateBattlefieldMap, isWalkable } from '../data/map';
import { SPEARMAN_ANIM_STATES, SPEARMAN_STATS } from '../data/spearman';
import { ArmatureView } from '../render/armature/ArmatureView';
import { Camera } from '../render/camera';
import { WORLD_SCALE } from '../render/constants';
import { Layers } from '../render/layers';
import { MapView } from '../render/map/MapView';
import { PixiRenderer } from '../render/PixiRenderer';
import { ShadowView } from '../render/ShadowView';
import { Battle, type UnitController } from '../sim/battle';
import { Unit } from '../sim/unit';
import { DebugPanel } from '../ui/DebugPanel';
import { lerp } from '../utils/math';
import type { UnitAnimState, Vec2 } from '../types';
import type { Scene } from './scenes';

/** 巡逻范围（世界单位，沿主路） */
const PATROL_MIN = 4;
const PATROL_MAX = 24;
const UNIT_Y = 18; // 主路 y 中心
/** 自动攻击演示间隔（秒） */
const AUTO_ATTACK_INTERVAL = 4.5;
/** 死亡溶解时长（秒，与 death 动画一致） */
const DEATH_DISSOLVE_TIME = 1.4;
/** 受击闪白时长（秒） */
const FLASH_TIME = 0.12;
/** 相机初始缩放 */
const CAM_ZOOM = 1.4;
/** 相机边界边距（世界像素） */
const CAM_MARGIN = 120;
/** 键盘平移速度（屏幕像素/秒） */
const PAN_SPEED = 700;

export interface BattleSceneOptions {
  canvas: HTMLCanvasElement;
  panelEl: HTMLElement;
}

export class BattleScene implements Scene {
  private renderer!: PixiRenderer;
  private layers!: Layers;
  private camera!: Camera;
  private loop: Loop | null = null;
  private map = generateBattlefieldMap();

  private unit!: Unit;
  private battle!: Battle;
  private player!: AnimationPlayer;
  private sm!: AnimationStateMachine;
  private view!: ArmatureView;
  private shadow!: ShadowView;
  private panel!: DebugPanel;

  /** 一次性动作（attack/block/hit/turn/death）剩余时间 */
  private oneShotRemain = 0;
  private autoTimer = AUTO_ATTACK_INTERVAL;
  private flashTimer = 0;
  private dissolving = false;
  private dissolveT = 0;
  private shake = 0;
  private lastFrameMs = 0;
  private renderFps = 0;
  private stopped = false;

  private mouseScreen: Vec2 = { x: 0, y: 0 };
  private readonly keys = new Set<string>();

  constructor(private readonly opts: BattleSceneOptions) {}

  async start(): Promise<void> {
    // 1. 渲染器 + 相机 + 分层（需求 5.1 / 5.2）
    this.renderer = new PixiRenderer();
    await this.renderer.init({
      canvas: this.opts.canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      background: 0x122418,
    });

    const focusPx: Vec2 = { x: 12 * WORLD_SCALE, y: UNIT_Y * WORLD_SCALE };
    this.camera = new Camera(CAM_ZOOM, {
      x: focusPx.x - this.renderer.width / 2 / CAM_ZOOM,
      y: focusPx.y - this.renderer.height / 2 / CAM_ZOOM,
    });
    this.camera.setScaleRange(0.5, 3);
    this.camera.setView(this.renderer.width, this.renderer.height);
    // 世界像素空间的地图边界（阶段 1 验收：平移/缩放不越界）
    this.camera.setBounds({ x: 0, y: 0, w: this.map.width * WORLD_SCALE, h: this.map.height * WORLD_SCALE }, CAM_MARGIN);

    this.layers = new Layers(this.renderer, this.renderer.root);

    // 2. 战场地图（静态，只绘制一次）
    const mapView = new MapView(this.map);
    this.layers.addChildTo('background', mapView.ground);
    this.layers.addChildTo('background', mapView.decorations);
    this.layers.addChildTo('background', mapView.border);

    // 3. 程序化资产：矢量部件 → 图集 + 骨骼数据
    const assets = generateSpearmanAssets();

    // 4. sim：单位（贴地：脚底在主路上）+ 战斗世界（演示控制器）
    this.unit = new Unit('spearman', 0, SPEARMAN_STATS, { x: 6, y: UNIT_Y });
    this.battle = new Battle([this.unit], this.patrolController);

    // 5. anim：DragonBones 兼容播放器 + 数据驱动状态机
    this.player = new AnimationPlayer(assets.skeleton, 'spearman');
    const smMap: AnimStateMap = {};
    for (const c of SPEARMAN_ANIM_STATES) smMap[c.state] = c;
    this.sm = new AnimationStateMachine(this.player, smMap, 'idle');

    // 6. render：骨骼视图（slot 精灵 + 三滤镜）+ 贴地阴影
    this.view = new ArmatureView({ atlas: assets.atlas, rig: assets.rig });
    this.layers.addChildTo('unit', this.view.container);
    this.shadow = new ShadowView();
    this.layers.addChildTo('shadow', this.shadow.container);

    // 7. 调试面板
    this.panel = new DebugPanel(this.opts.panelEl, {
      onState: (s) => this.playState(s),
      onFlash: (v) => {
        this.view.flash.amount = v;
      },
      onDissolve: (v) => {
        this.view.dissolve.progress = v;
      },
      onOutline: (v) => {
        this.view.outline.width = v;
      },
      onOutlineEnabled: (v) => {
        this.view.outline.filter.enabled = v;
      },
      onZoomIn: () => this.zoomCamera(1.25),
      onZoomOut: () => this.zoomCamera(0.8),
      onReset: () => this.resetUnit(),
    });

    // 8. 主循环：固定时间步长（1/60s）+ 渲染插值
    this.lastFrameMs = performance.now();
    this.loop = new Loop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha) => this.renderFrame(alpha),
    });
    this.loop.start();

    // 9. 输入：滚轮缩放 + 拖拽/键盘平移 + 鼠标追踪 + 窗口缩放
    this.bindInput();
  }

  stop(): void {
    this.stopped = true;
    this.loop?.stop();
  }

  /** 调试探针：供浏览器验证脚本/开发者工具读取运行时状态 */
  debugState(): {
    simTime: number;
    steps: number;
    stepsPerSec: number;
    unitPos: { x: number; y: number };
    animState: string;
    dirX: number;
    renderFps: number;
    camera: { scale: number; offset: { x: number; y: number }; view: { w: number; h: number } };
    view: {
      pos: { x: number; y: number };
      children: number;
      visible: boolean;
      firstChild: { texW: number; texH: number; pos: { x: number; y: number } } | null;
    };
  } {
    const v = this.view;
    const first = v.container.children[0] as { texture?: { width: number; height: number }; position?: { x: number; y: number } } | undefined;
    return {
      simTime: this.loop?.simTime ?? 0,
      steps: this.loop?.steps ?? 0,
      stepsPerSec: this.loop?.stepsPerSec ?? 0,
      unitPos: { ...this.unit.pos },
      animState: this.sm.current,
      dirX: this.unit.dirX,
      renderFps: this.renderFps,
      camera: {
        scale: this.camera.scale,
        offset: { ...this.camera.offset },
        view: { w: this.renderer.width, h: this.renderer.height },
      },
      view: {
        pos: { x: v.container.position.x, y: v.container.position.y },
        children: v.container.children.length,
        visible: v.container.visible,
        firstChild: first
          ? { texW: first.texture?.width ?? 0, texH: first.texture?.height ?? 0, pos: { x: first.position?.x ?? 0, y: first.position?.y ?? 0 } }
          : null,
      },
    };
  }

  // —— 演示控制器（阶段 3 换为 sim/ai 的 decide） ——

  private readonly patrolController: UnitController = (unit, _battle, dt) => {
    if (!unit.alive || this.dissolving) return;
    // 一次性动作期间不移动
    if (this.oneShotRemain > 0) {
      this.oneShotRemain -= dt;
      if (this.oneShotRemain <= 0) this.resumeAfterOneShot();
      return;
    }
    // 自动攻击演示（命中帧联动闪白+震屏）
    this.autoTimer -= dt;
    if (this.autoTimer <= 0) {
      this.autoTimer = AUTO_ATTACK_INTERVAL;
      this.playOneShot('attack');
      return;
    }
    // 巡逻：沿主路 x 轴往返
    unit.prevPos = { ...unit.pos };
    unit.pos.x += unit.dirX * unit.stats.moveSpeed * dt;
    if (unit.pos.x >= PATROL_MAX) {
      this.setDir(-1);
      if (this.oneShotRemain > 0) return; // 转向动作优先
    } else if (unit.pos.x <= PATROL_MIN) {
      this.setDir(1);
      if (this.oneShotRemain > 0) return;
    }
    this.sm.setState('walk');
  };

  // —— 固定步长模拟 ——

  private fixedUpdate(dt: number): void {
    if (this.stopped) return;
    this.battle.update(dt);
    this.player.update(dt);

    // 动画事件 → 逻辑/表现联动（需求 6.3：命中帧驱动伤害结算，画面数值同步）
    for (const ev of this.player.drainEvents()) {
      if (ev === ANIM_EVENTS.HIT_FRAME) this.onHitFrame();
    }

    // 受击闪白衰减
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.view.flash.amount = Math.max(0, this.flashTimer / FLASH_TIME);
    }

    // 死亡溶解推进（死亡动作播放期间同步消散）
    if (this.dissolving) {
      this.dissolveT += dt / DEATH_DISSOLVE_TIME;
      this.view.dissolve.progress = Math.min(1, this.dissolveT);
      if (this.dissolveT >= 1) {
        this.dissolving = false;
        this.view.visible = false;
        this.shadow.visible = false;
      }
    }

    // 震屏衰减
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 10);
  }

  // —— 渲染（每帧，带插值） ——

  private renderFrame(alpha: number): void {
    // 渲染 FPS 统计
    const now = performance.now();
    const frameDt = now - this.lastFrameMs;
    this.lastFrameMs = now;
    if (frameDt > 0) this.renderFps = 1000 / frameDt;

    // 键盘平移（WASD/方向键）
    this.applyKeyboardPan(frameDt / 1000);

    // 位置插值（固定步长 prev/curr + alpha）
    const px = lerp(this.unit.prevPos.x, this.unit.pos.x, alpha) * WORLD_SCALE;
    const py = lerp(this.unit.prevPos.y, this.unit.pos.y, alpha) * WORLD_SCALE;
    this.view.setPosition(px, py);
    this.view.setFacing(this.unit.dirX);
    this.view.applyPose(this.player.armatureState.slots);
    // 贴地阴影（脚底微偏下）
    this.shadow.setPosition(px, py + 4);

    // 相机：screen = (worldPx - offset) × scale（含震屏）
    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 5 : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 5 : 0;
    this.renderer.setTransform(this.renderer.root, {
      x: -this.camera.offset.x * this.camera.scale + shx,
      y: -this.camera.offset.y * this.camera.scale + shy,
      scaleX: this.camera.scale,
      scaleY: this.camera.scale,
    });

    this.renderer.render();

    // 面板统计
    const mouseWorld = this.camera.screenToWorld(this.mouseScreen);
    this.panel.updateStats({
      renderFps: this.renderFps,
      simStepsPerSec: this.loop?.stepsPerSec ?? 0,
      simTime: this.loop?.simTime ?? 0,
      unitPos: this.unit.pos,
      animState: this.sm.current,
      dirX: this.unit.dirX,
      camScale: this.camera.scale,
      mouseWorld: { x: mouseWorld.x / WORLD_SCALE, y: mouseWorld.y / WORLD_SCALE },
      unitWalkable: isWalkable(this.map, this.unit.pos),
    });
  }

  private applyKeyboardPan(dtReal: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
    if (dx !== 0 || dy !== 0) {
      // 键盘语义 = "镜头移动方向"（按右箭头 → 镜头右移 → 看到右侧内容 → 内容左移）。
      // pan(dx) 实现的是"内容右移 dx"（拖拽语义），因此这里取反。
      this.camera.pan(-dx * PAN_SPEED * dtReal, -dy * PAN_SPEED * dtReal);
    }
  }

  // —— 状态与表现控制 ——

  /** 播放一次性动作（attack/block/hit/turn/death），期间暂停巡逻 */
  private playOneShot(state: UnitAnimState): void {
    const cfg = SPEARMAN_ANIM_STATES.find((c) => c.state === state);
    if (!cfg) return;
    this.oneShotRemain = this.player.getDuration(cfg.anim);
    this.sm.setState(state);
  }

  private resumeAfterOneShot(): void {
    if (!this.unit.alive) {
      this.sm.setState('idle');
      return;
    }
    this.sm.setState('walk');
  }

  private setDir(dir: 1 | -1): void {
    if (this.unit.dirX === dir) return;
    this.unit.dirX = dir;
    this.playOneShot('turn');
  }

  private playState(state: UnitAnimState): void {
    if (!this.unit.alive && state !== 'death') this.resetUnit();
    if (state === 'death') {
      this.startDeath();
      return;
    }
    if (state === 'attack' || state === 'block' || state === 'hit' || state === 'turn') {
      this.playOneShot(state);
      return;
    }
    // idle / walk：直接切换并解除一次性锁定
    this.oneShotRemain = 0;
    this.sm.setState(state);
  }

  private startDeath(): void {
    if (!this.unit.alive) return;
    this.unit.alive = false;
    this.dissolving = true;
    this.dissolveT = 0;
    this.view.dissolve.progress = 0;
    this.oneShotRemain = this.player.getDuration('death');
    this.sm.setState('death');
  }

  private resetUnit(): void {
    this.unit = new Unit('spearman', 0, SPEARMAN_STATS, { x: 6, y: UNIT_Y });
    this.battle = new Battle([this.unit], this.patrolController);
    this.view.visible = true;
    this.shadow.visible = true;
    this.view.dissolve.progress = 0;
    this.view.flash.amount = 0;
    this.dissolving = false;
    this.dissolveT = 0;
    this.oneShotRemain = 0;
    this.autoTimer = AUTO_ATTACK_INTERVAL;
    this.sm.force('idle');
    this.sm.setState('walk');
  }

  private onHitFrame(): void {
    this.flashTimer = FLASH_TIME;
    this.view.flash.amount = 1;
    this.shake = 1;
  }

  private zoomCamera(factor: number): void {
    this.camera.zoomBy(factor, { x: this.renderer.width / 2, y: this.renderer.height / 2 });
  }

  // —— 输入 ——

  private bindInput(): void {
    const canvas = this.opts.canvas;
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        this.camera.zoomBy(e.deltaY < 0 ? 1.1 : 0.9, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      },
      { passive: false },
    );

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!dragging) return;
      this.camera.pan(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const endDrag = (): void => {
      dragging = false;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('resize', () => {
      this.renderer.resize(window.innerWidth, window.innerHeight);
      this.camera.setView(this.renderer.width, this.renderer.height);
    });
  }
}
