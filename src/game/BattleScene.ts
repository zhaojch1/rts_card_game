/**
 * 战斗场景组装（game/BattleScene.ts）—— 框架底座演示。
 *
 * 已交付能力（兵种无关）：
 *  1. 固定时间步长主循环（1/60s 模拟 + 渲染插值 alpha）；
 *  2. IRenderer 抽象渲染管线（PixiJS v8 WebGL2 实现）；
 *  3. 分层渲染（背景/阴影/单位/特效/UI）；
 *  4. 程序化战场地图 + 带边界限制的相机（滚轮缩放/拖拽/WASD 平移）；
 *  5. 三个自定义 shader 特效（闪白/描边/溶解）+ 打击感特效管理器；
 *  6. DragonBones 兼容骨骼动画运行时（anim/）与程序化矢量烘焙管线（art/，含烘焙 pivot 待办）。
 *
 * 演示内容：一个可被 shader 着色的"测试对象"（几何图形）在战场主路上往返移动，
 * 验证逻辑与渲染解耦、固定时间步长、相机与世界坐标换算、特效层。
 * 单位/兵种/战斗内容已按决策移除，等待接任者按 README 交接说明重建。
 */
import { Container, Graphics, Texture } from 'pixi.js';
import { Loop } from '../core/loop';
import { generateBattlefieldMap } from '../data/map';
import { Camera } from '../render/camera';
import { WORLD_SCALE } from '../render/constants';
import { EffectsManager } from '../render/effects/EffectsManager';
import { Layers } from '../render/layers';
import { MapView } from '../render/map/MapView';
import { PixiRenderer } from '../render/PixiRenderer';
import { ShadowView } from '../render/ShadowView';
import { DissolveFilter, FlashFilter, OutlineFilter } from '../render/shaders';
import { DebugPanel } from '../ui/DebugPanel';
import { createNoiseCanvas } from '../utils/noise';
import { lerp } from '../utils/math';
import type { Vec2 } from '../types';
import type { Scene } from './scenes';

/** 巡逻范围（世界单位，沿主路） */
const PATROL_MIN = 4;
const PATROL_MAX = 24;
const PATROL_Y = 18;
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

  /** 测试对象（shader 着色几何体） */
  private testObj!: Container;
  private testShadow!: ShadowView;
  private objPos: Vec2 = { x: PATROL_MIN, y: PATROL_Y };
  private objPrev: Vec2 = { x: PATROL_MIN, y: PATROL_Y };
  private objDir: 1 | -1 = 1;

  private effects!: EffectsManager;
  private panel!: DebugPanel;

  private lastFrameMs = 0;
  private renderFps = 0;
  private stopped = false;
  private mouseScreen: Vec2 = { x: 0, y: 0 };
  private readonly keys = new Set<string>();

  constructor(private readonly opts: BattleSceneOptions) {}

  async start(): Promise<void> {
    // 1. 渲染器 + 相机 + 分层
    this.renderer = new PixiRenderer();
    await this.renderer.init({
      canvas: this.opts.canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      background: 0x122418,
    });

    const focusPx: Vec2 = { x: 12 * WORLD_SCALE, y: PATROL_Y * WORLD_SCALE };
    this.camera = new Camera(CAM_ZOOM, {
      x: focusPx.x - this.renderer.width / 2 / CAM_ZOOM,
      y: focusPx.y - this.renderer.height / 2 / CAM_ZOOM,
    });
    this.camera.setScaleRange(0.5, 3);
    this.camera.setView(this.renderer.width, this.renderer.height);
    this.camera.setBounds({ x: 0, y: 0, w: this.map.width * WORLD_SCALE, h: this.map.height * WORLD_SCALE }, CAM_MARGIN);

    this.layers = new Layers(this.renderer, this.renderer.root);

    // 2. 战场地图（静态，一次绘制）
    const mapView = new MapView(this.map);
    this.layers.addChildTo('background', mapView.ground);
    this.layers.addChildTo('background', mapView.decorations);
    this.layers.addChildTo('background', mapView.border);

    // 3. 测试对象：可被 shader 着色的几何体（验证渲染管线/特效层）
    this.testObj = new Container();
    const g = new Graphics();
    g.ellipse(0, 20, 22, 6).fill({ color: 0x000000, alpha: 0.3 });
    g.circle(0, 0, 20).fill(0x3d5c8a);
    g.circle(0, 0, 15).fill(0x4d7ab8);
    g.circle(0, -4, 8).fill(0x7fb0e8);
    g.circle(0, -2, 3).fill(0xdcefff);
    this.testObj.addChild(g);

    const flash = new FlashFilter();
    const outline = new OutlineFilter();
    const dissolve = new DissolveFilter(Texture.from(createNoiseCanvas()).source);
    this.testObj.filters = [flash.filter, dissolve.filter, outline.filter];

    this.layers.addChildTo('unit', this.testObj);
    this.testShadow = new ShadowView(18, 6);
    this.layers.addChildTo('shadow', this.testShadow.container);
    this.effects = new EffectsManager(this.layers.get('effect') as Container);

    // 4. 调试面板
    this.panel = new DebugPanel(this.opts.panelEl, {
      onFlash: (v) => {
        flash.amount = v;
      },
      onDissolve: (v) => {
        dissolve.progress = v;
      },
      onOutline: (v) => {
        outline.width = v;
      },
      onOutlineEnabled: (v) => {
        outline.filter.enabled = v;
      },
      onZoomIn: () => this.zoomCamera(1.25),
      onZoomOut: () => this.zoomCamera(0.8),
      onReset: () => this.resetTestObject(),
    });

    // 5. 主循环：固定时间步长
    this.lastFrameMs = performance.now();
    this.loop = new Loop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha) => this.renderFrame(alpha),
    });
    this.loop.start();

    // 6. 输入
    this.bindInput();
  }

  // —— 固定步长模拟 ——

  private fixedUpdate(dt: number): void {
    if (this.stopped) return;
    // 测试对象沿主路往返（纯逻辑，无渲染依赖）
    this.objPrev = { ...this.objPos };
    this.objPos.x += this.objDir * 1.2 * dt;
    if (this.objPos.x >= PATROL_MAX) this.objDir = -1;
    else if (this.objPos.x <= PATROL_MIN) this.objDir = 1;

    this.effects.update(dt);
  }

  // —— 渲染（每帧，带插值） ——

  private renderFrame(alpha: number): void {
    const now = performance.now();
    const frameDt = now - this.lastFrameMs;
    this.lastFrameMs = now;
    if (frameDt > 0) this.renderFps = 1000 / frameDt;

    // 键盘平移
    this.applyKeyboardPan(frameDt / 1000);

    // 位置插值（固定步长 prev/curr + alpha）
    const px = lerp(this.objPrev.x, this.objPos.x, alpha) * WORLD_SCALE;
    const py = lerp(this.objPrev.y, this.objPos.y, alpha) * WORLD_SCALE;
    this.testObj.position.set(px, py);
    this.testShadow.setPosition(px, py + 8);

    // 相机：screen = (worldPx - offset) × scale
    this.renderer.setTransform(this.renderer.root, {
      x: -this.camera.offset.x * this.camera.scale,
      y: -this.camera.offset.y * this.camera.scale,
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
      objPos: this.objPos,
      camScale: this.camera.scale,
      mouseWorld: { x: mouseWorld.x / WORLD_SCALE, y: mouseWorld.y / WORLD_SCALE },
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
      // 键盘语义 = 镜头移动方向；pan 为内容移动语义，取反
      this.camera.pan(-dx * PAN_SPEED * dtReal, -dy * PAN_SPEED * dtReal);
    }
  }

  private resetTestObject(): void {
    this.objPos = { x: PATROL_MIN, y: PATROL_Y };
    this.objPrev = { ...this.objPos };
    this.objDir = 1;
  }

  private zoomCamera(factor: number): void {
    this.camera.zoomBy(factor, { x: this.renderer.width / 2, y: this.renderer.height / 2 });
  }

  /** 调试探针：供浏览器验证脚本/开发者工具读取运行时状态 */
  debugState(): {
    simTime: number;
    steps: number;
    stepsPerSec: number;
    objPos: { x: number; y: number };
    renderFps: number;
    camera: { scale: number; offset: { x: number; y: number }; view: { w: number; h: number } };
    fxActive: number;
  } {
    return {
      simTime: this.loop?.simTime ?? 0,
      steps: this.loop?.steps ?? 0,
      stepsPerSec: this.loop?.stepsPerSec ?? 0,
      objPos: { ...this.objPos },
      renderFps: this.renderFps,
      camera: {
        scale: this.camera.scale,
        offset: { ...this.camera.offset },
        view: { w: this.renderer.width, h: this.renderer.height },
      },
      fxActive: this.effects.activeCount,
    };
  }

  stop(): void {
    this.stopped = true;
    this.loop?.stop();
  }

  // —— 输入 ——

  private bindInput(): void {
    const canvas = this.opts.canvas;
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        this.camera.zoomBy(e.deltaY < 0 ? 1.1 : 0.9, { x: e.clientX - rect.left, y: e.clientY - rect.top });
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
