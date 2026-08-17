/**
 * 动画事件（anim/events.ts）—— 命中帧、收招等逻辑联动信号的类型定义。
 *
 * 需求 6.3：攻击动作在"命中帧"事件触发伤害结算，而非动画结束才结算。
 * 事件由 AnimationPlayer 在关键帧时刻产出（drainEvents），
 * sim/ 通过回调订阅（BattleScene 中接线），保证画面与数值同步。
 */

/** 内置动画事件名（与数据中的 events[].name 对应） */
export const ANIM_EVENTS = {
  /** 攻击命中帧：此刻进行伤害结算 */
  HIT_FRAME: 'hit_frame',
  /** 死亡动作播完：可移除单位/触发结算 */
  DEATH_DONE: 'death_done',
  /** 格挡生效帧 */
  BLOCK_FRAME: 'block_frame',
} as const;

export type AnimEventName = (typeof ANIM_EVENTS)[keyof typeof ANIM_EVENTS];

/** 动画事件订阅者接口（由 game/ 层实现并接线到 sim/ 战斗逻辑） */
export interface AnimEventListener {
  onAnimEvent(event: AnimEventName): void;
}
