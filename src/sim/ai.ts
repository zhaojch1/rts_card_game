/**
 * 单位 AI（sim/ai.ts）—— 需求 11.1。
 *
 * 状态流：待机 → 索敌 → 追击 → 攻击 →（目标死亡后）重新索敌。
 * 索敌优先级：攻击自己的单位 > 最近单位（仇恨机制，需求 10.3）。
 * 阶段 0 只实现索敌纯函数；阶段 3（两个长枪兵对打）接入完整 decide。
 */
import { distVec2 } from '../utils/math';
import type { Unit } from './unit';
import type { Battle } from './battle';

/** 查找最近敌方单位（按仇恨优先级：正在攻击自己的优先） */
export function findNearestEnemy(unit: Unit, battle: Battle): Unit | null {
  let best: Unit | null = null;
  let bestDist = Infinity;
  let bestHasAggro = false;
  for (const other of battle.units) {
    if (other === unit || !other.alive || other.team === unit.team) continue;
    const d = distVec2(unit.pos, other.pos);
    const hasAggro = other.target === unit;
    if (
      best === null ||
      (hasAggro && !bestHasAggro) ||
      (hasAggro === bestHasAggro && d < bestDist)
    ) {
      best = other;
      bestDist = d;
      bestHasAggro = hasAggro;
    }
  }
  return best;
}

/**
 * 完整 AI 决策（阶段 3 启用）：
 * 索敌 → 追击（进入攻击范围）→ 攻击（冷却 + 命中帧联动）
 */
export function decide(unit: Unit, battle: Battle, dt: number): void {
  if (unit.target === null || !unit.target.alive) {
    unit.target = findNearestEnemy(unit, battle);
    if (unit.target === null) {
      unit.animState = 'idle';
      return;
    }
  }
  const target = unit.target;
  unit.faceTo(target.pos);
  const d = distVec2(unit.pos, target.pos);
  if (d > unit.attackRange) {
    // 追击
    unit.animState = 'walk';
    const step = unit.stats.moveSpeed * dt;
    const dx = target.pos.x - unit.pos.x;
    const dy = target.pos.y - unit.pos.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    unit.prevPos = { ...unit.pos };
    unit.pos.x += (dx / len) * step;
    unit.pos.y += (dy / len) * step;
  } else {
    // 攻击
    unit.animState = 'attack';
    unit.attackTimer -= dt;
    if (unit.attackTimer <= 0) {
      unit.attackTimer = unit.attackInterval;
      // 伤害结算在"命中帧"动画事件时执行（阶段 3 接线）；
      // 此处仅推进状态，实际结算由战斗循环在 hit_frame 事件中调用 unit.attackRoll
    }
  }
}
