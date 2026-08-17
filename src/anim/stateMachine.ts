/**
 * 动画状态机（anim/stateMachine.ts）—— 数据驱动，纯逻辑。
 *
 * 把"逻辑状态（idle/walk/attack/...）"映射为"动画名 + 循环 + 混合时长"，
 * 由配置（data/）驱动，动作名与配置对应，不硬编码（需求 6.1 / 9.3）。
 * 状态间可中断切换并平滑混合（通过 AnimationPlayer 的交叉淡入淡出实现）。
 */
import type { AnimStateConfig, UnitAnimState } from '../types';

export type AnimStateMap = Partial<Record<UnitAnimState, AnimStateConfig>>;

export class AnimationStateMachine {
  private _current: UnitAnimState;

  constructor(
    private readonly player: {
      play(name: string, opts: { loop?: boolean; fadeTime?: number }): boolean;
    },
    private readonly map: AnimStateMap,
    initial: UnitAnimState = 'idle',
  ) {
    this._current = initial;
  }

  get current(): UnitAnimState {
    return this._current;
  }

  /** 请求切换到某个逻辑状态（可中断切换）。重复请求同一状态时不重启动画。 */
  setState(state: UnitAnimState): boolean {
    if (state === this._current) return true;
    const cfg = this.map[state];
    if (!cfg) return false;
    const ok = this.player.play(cfg.anim, { loop: cfg.loop, fadeTime: cfg.blend });
    if (ok) this._current = state;
    return ok;
  }

  /** 强制设置当前状态（不触发播放；用于初始化/外部接管） */
  force(state: UnitAnimState): void {
    this._current = state;
  }
}
