import * as Phaser from 'phaser';
import { Rive } from '@rive-app/canvas';

/**
 * Phaser 4 + Rive 集成验证场景
 *
 * 技术路线：玩法逻辑在 Phaser（游戏内核），角色动画由 Rive（表现层）渲染。
 * Rive 画在独立的 DOM canvas 上，叠加在 Phaser 画布之上——和你定的 DOM UI 架构一致。
 *
 * 当前用 Rive 官方示例 off_road_car.riv 验证。
 * 换成你自己的长枪兵：把 .riv 放进 public/rive/，改下面 RIVE_SRC 即可，其余代码不用动。
 *
 * 操作：
 *   点击  → 小车开过去（移动时自动切 run 动画，停下切 idle）
 *   1/2/3 → 手动切 idle / run / boost 动画
 *   A     → 触发一次爆发动画（模拟"攻击动作"触发，1.2 秒后自动回 idle）
 */

const RIVE_SRC = '/rive/off_road_car.riv';
const RIVE_VERSION = '2.40.0'; // 升级 @rive-app/canvas 时同步更新
const RIVE_CANVAS_SIZE = 160; // 每个单位一个 160x160 的 rive canvas
const CAR_SPEED = 260; // 像素/秒

export class RiveSpikeScene extends Phaser.Scene {
  private car = { x: 400, y: 500, facing: 1 };
  private moveTarget: { x: number; y: number } | null = null;
  private burst = 0; // 爆发动画剩余时间

  private rive!: Rive;
  private riveCanvas!: HTMLCanvasElement;
  private layer!: HTMLDivElement;
  private animNames: string[] = [];
  private currentAnim = '';
  private status!: Phaser.GameObjects.Text;
  private targetRing!: Phaser.GameObjects.Graphics;
  private syncDot!: Phaser.GameObjects.Arc;

  constructor() {
    super('rive-spike');
  }

  create() {
    console.log('[RiveSpike] Phaser =', Phaser.VERSION, '| Rive =', RIVE_VERSION);

    // 背景 + 网格
    const grid = this.add.graphics().setDepth(-1);
    grid.lineStyle(1, 0xffffff, 0.07);
    for (let x = 0; x <= 1280; x += 64) {
      grid.beginPath();
      grid.moveTo(x, 0);
      grid.lineTo(x, 720);
      grid.strokePath();
    }
    for (let y = 0; y <= 720; y += 64) {
      grid.beginPath();
      grid.moveTo(0, y);
      grid.lineTo(1280, y);
      grid.strokePath();
    }

    // 目标点标记 + 同步锚点（Phaser 世界里小车"脚下"的绿点，用来肉眼核对两套坐标系对齐）
    this.targetRing = this.add.graphics().setDepth(5);
    this.syncDot = this.add.circle(this.car.x, this.car.y, 5, 0x39ff14, 0.9).setDepth(6);

    // 状态信息
    this.status = this.add
      .text(20, 20, '加载中…', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setDepth(50);

    // ---------- DOM 叠加层 ----------
    const gameEl = document.getElementById('game')!;
    const phaserCanvas = this.game.canvas;
    this.layer = document.createElement('div');
    this.layer.style.cssText =
      'position:absolute;pointer-events:none;z-index:10;';
    this.positionLayer(gameEl, phaserCanvas);
    gameEl.appendChild(this.layer);

    this.riveCanvas = document.createElement('canvas');
    this.riveCanvas.width = RIVE_CANVAS_SIZE;
    this.riveCanvas.height = RIVE_CANVAS_SIZE;
    this.riveCanvas.style.cssText = `position:absolute;width:${RIVE_CANVAS_SIZE}px;height:${RIVE_CANVAS_SIZE}px;left:0;top:0;`;
    this.layer.appendChild(this.riveCanvas);

    // 窗口尺寸变化时重新对齐叠加层
    window.addEventListener('resize', () => this.positionLayer(gameEl, phaserCanvas));

    // ---------- Rive 实例 ----------
    this.rive = new Rive({
      src: RIVE_SRC,
      canvas: this.riveCanvas,
      autoplay: true,
      onLoad: () => {
        this.animNames = [...this.rive.animationNames];
        this.playAnim(this.animNames.includes('idle') ? 'idle' : this.animNames[0]);
        this.log(`加载成功：${this.animNames.length} 个动画 → ${this.animNames.join(', ')}`);
      },
      onLoadError: (e) => {
        this.log(`加载失败：${String(e)}（文件路径 ${RIVE_SRC}）`);
      },
    });

    // ---------- 输入 ----------
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.moveTarget = { x: pointer.x, y: pointer.y };
    });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === '1') this.playAnim('idle');
      if (k === '2') this.playAnim('run');
      if (k === '3') this.playAnim('boost');
      if (k === 'a') {
        // 模拟攻击/技能：触发一次爆发动画，1.2 秒后回到 idle
        this.burst = 1.2;
        this.playAnim(this.animNames.includes('boost') ? 'boost' : 'run');
      }
    });
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    const car = this.car;

    // 移动（和长枪兵 demo 同一套逻辑）
    let moving = false;
    if (this.moveTarget) {
      const dx = this.moveTarget.x - car.x;
      const dy = this.moveTarget.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        this.moveTarget = null;
      } else {
        const step = Math.min(CAR_SPEED * dt, d);
        car.x += (dx / d) * step;
        car.y += (dy / d) * step;
        car.facing = dx >= 0 ? 1 : -1;
        moving = true;
      }
    }

    // 动画状态：爆发 > 移动 > 静止
    if (this.burst > 0) {
      this.burst -= dt;
      if (this.burst <= 0) this.playAnim('idle');
    } else if (moving) {
      if (this.currentAnim !== 'run') this.playAnim('run');
    } else if (this.currentAnim !== 'idle') {
      this.playAnim('idle');
    }

    // 同步 Rive canvas 到 Phaser 世界坐标（translate(-50%,-50%) = 画布中心对准单位位置）
    this.riveCanvas.style.left = `${car.x}px`;
    this.riveCanvas.style.top = `${car.y}px`;
    this.riveCanvas.style.transform = `translate(-50%, -50%) scaleX(${car.facing})`;

    // 同步锚点绿点跟随
    this.syncDot.setPosition(car.x, car.y);

    // 目标点标记
    this.targetRing.clear();
    if (this.moveTarget) {
      const pulse = 0.5 + 0.3 * Math.sin(this.time.now / 150);
      this.targetRing.lineStyle(2, 0xffffff, pulse);
      this.targetRing.strokeCircle(this.moveTarget.x, this.moveTarget.y, 14);
    }
  }

  shutdown() {
    this.rive?.cleanup();
    this.layer?.remove();
  }

  private playAnim(name: string) {
    if (this.animNames.length && !this.animNames.includes(name)) {
      this.log(`动画 "${name}" 不存在，可选：${this.animNames.join(', ')}`);
      return;
    }
    this.currentAnim = name;
    this.rive?.play(name);
    this.log(`当前动画：${name}`);
  }

  private log(line: string) {
    console.log('[RiveSpike]', line);
    this.status.setText(
      [
        `Phaser ${Phaser.VERSION} ｜ Rive ${RIVE_VERSION}`,
        `文件：${RIVE_SRC}`,
        `动画：${this.animNames.join(', ') || '（加载中…）'}`,
        `当前：${this.currentAnim || '-'}`,
        '',
        '点击移动 ｜ 1=idle 2=run 3=boost ｜ A=爆发',
        line,
      ].join('\n')
    );
  }

  private positionLayer(gameEl: HTMLElement, phaserCanvas: HTMLCanvasElement) {
    if (!this.layer) return;
    const g = gameEl.getBoundingClientRect();
    const c = phaserCanvas.getBoundingClientRect();
    this.layer.style.left = `${c.left - g.left}px`;
    this.layer.style.top = `${c.top - g.top}px`;
    this.layer.style.width = `${c.width}px`;
    this.layer.style.height = `${c.height}px`;
  }
}
