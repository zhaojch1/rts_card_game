/**
 * 伤害计算（sim/combat.ts）—— 需求 10.4，纯函数，可独立单元测试。
 *
 * - 基础伤害 = 攻击力 − 防御力（下限 1）
 * - 暴击：概率触发 1.5 倍伤害
 * - 类型克制（步兵克骑兵、骑兵克远程、远程克步兵）：阶段 4 引入兵种后启用
 */
import type { DamageResult, UnitKind, UnitStats } from '../types';

export interface CombatContext {
  attacker: { stats: UnitStats; kind: UnitKind };
  defender: { stats: UnitStats; kind: UnitKind };
  /** 0..1 随机数（注入以便测试确定性） */
  roll: number;
}

export const CRIT_MULTIPLIER = 1.5;
export const MIN_DAMAGE = 1;

/** 类型克制倍率表（阶段 4 引入远程/骑兵后启用） */
const COUNTER_MAP: Partial<Record<UnitKind, Partial<Record<UnitKind, number>>>> = {};

export function computeDamage(ctx: CombatContext): DamageResult {
  const { attacker, defender, roll } = ctx;
  const crit = roll < attacker.stats.critChance;
  let base = Math.max(MIN_DAMAGE, attacker.stats.attack - defender.stats.defense);
  const counter = COUNTER_MAP[attacker.kind]?.[defender.kind] ?? 1;
  base *= counter;
  if (crit) base *= CRIT_MULTIPLIER;
  return { amount: Math.round(base), crit };
}
