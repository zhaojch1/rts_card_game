/**
 * 固定时间步长主循环（core/loop.ts）—— 反返工铁律 #5。
 *
 * 逻辑模拟以固定 dt（1/60s）步进，保证确定性、可复现，与渲染器/刷新率解耦；
 * 渲染每帧执行一次，并用 alpha（累加器余量 / 固定 dt）做渲染插值。
 *
 * 验收点：
 *  - 144Hz 显示器上逻辑速度与 60Hz 一致（模拟永远每秒 60 步）。
 *  - sim/ 只通过 fixedUpdate 收到固定 dt；渲染层只通过 render(alpha) 拿插值。
 */
import { Clock } from './clock';

export const FIXED_DT = 1 / 60;

export interface LoopCallbacks {
  /** 固定步长模拟回调：dt 恒等于 FIXED_DT */
  fixedUpdate: (dt: number) => void;
  /** 渲染回调：alpha ∈ [0,1)，用于对 prev/curr 状态做插值 */
  render: (alpha: number) => void;
}

/** 调度器注入（测试用）：替换 rAF 与时间源 */
export interface LoopScheduler {
  raf?: (cb: FrameRequestCallback) => number;
  cancelRaf?: (id: number) => void;
  now?: () => number;
}

export class Loop {
  private readonly clock: Clock;
  private readonly raf: (cb: FrameRequestCallback) => number;
  private readonly cancelRaf: (id: number) => void;
  private acc = 0;
  private rafId = 0;
  private running = false;
  private _steps = 0;
  private _simTime = 0;
  private _lastStepCount = 0;
  private _lastStepStamp = 0;
  /** 近一秒内实际执行的模拟步数（用于调试面板验证 60/s） */
  private _stepsPerSec = 0;

  constructor(
    private readonly cb: LoopCallbacks,
    scheduler: LoopScheduler = {},
  ) {
    this.raf = scheduler.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancelRaf = scheduler.cancelRaf ?? ((id) => cancelAnimationFrame(id));
    this.clock = new Clock(scheduler.now);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
    this.rafId = this.raf(this.frame);
  }

  stop(): void {
    this.running = false;
    this.cancelRaf(this.rafId);
  }

  private readonly frame = (): void => {
    if (!this.running) return;
    const dt = this.clock.tick();
    this.acc += dt;

    while (this.acc >= FIXED_DT) {
      this.cb.fixedUpdate(FIXED_DT);
      this.acc -= FIXED_DT;
      this._steps++;
      this._simTime += FIXED_DT;
    }

    // 统计每秒模拟步数（证明"逻辑速度与刷新率无关"）
    const nowMs = performance.now();
    if (nowMs - this._lastStepStamp >= 1000) {
      this._stepsPerSec = this._steps - this._lastStepCount;
      this._lastStepCount = this._steps;
      this._lastStepStamp = nowMs;
    }

    const alpha = this.acc / FIXED_DT;
    this.cb.render(alpha);
    this.rafId = this.raf(this.frame);
  };

  /** 累计模拟步数 */
  get steps(): number {
    return this._steps;
  }

  /** 模拟时间（秒） */
  get simTime(): number {
    return this._simTime;
  }

  /** 近一秒实际模拟步数（≈60 = 正确） */
  get stepsPerSec(): number {
    return this._stepsPerSec;
  }
}
