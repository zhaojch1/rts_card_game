/**
 * 时间与 delta 计算（core/clock.ts）
 * 只负责测量"真实流逝时间"，不负责步进逻辑（步进在 loop.ts）。
 */

export class Clock {
  private _last = -1;
  private _elapsed = 0;
  private _paused = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** 自上次 tick 以来的真实秒数（首次调用返回 0，暂停时返回 0） */
  tick(): number {
    const t = this.now();
    if (this._last < 0) {
      // 首次调用：仅记录基准时间，不产生 delta
      this._last = t;
      return 0;
    }
    let dt = (t - this._last) / 1000;
    this._last = t;
    if (this._paused) dt = 0;
    // 钳制：切后台/卡顿后的超大 dt 直接丢弃，避免"追赶"导致逻辑跳变
    if (dt > 0.25) dt = 0;
    this._elapsed += dt;
    return dt;
  }

  /** 累计真实流逝时间（秒） */
  get elapsed(): number {
    return this._elapsed;
  }

  pause(): void {
    this._paused = true;
    this._last = -1;
  }

  resume(): void {
    this._paused = false;
    this._last = -1;
  }

  reset(): void {
    this._last = -1;
    this._elapsed = 0;
  }
}
