/**
 * 伤害计算单元测试（sim/combat 纯函数）
 */
import { describe, expect, it } from 'vitest';
import { computeDamage, MIN_DAMAGE } from '../src/sim/combat';
import type { UnitStats } from '../src/types';

const stats = (over: Partial<UnitStats>): UnitStats => ({
  attack: 15,
  health: 100,
  defense: 5,
  attackSpeed: 1,
  moveSpeed: 1.2,
  attackRange: 1.8,
  critChance: 0.1,
  ...over,
});

describe('computeDamage', () => {
  it('基础伤害 = 攻击力 − 防御力', () => {
    const r = computeDamage({
      attacker: { stats: stats({}), kind: 'test' },
      defender: { stats: stats({}), kind: 'test' },
      roll: 1, // 不暴击
    });
    expect(r.amount).toBe(10);
    expect(r.crit).toBe(false);
  });

  it('防御力高于攻击力时伤害有下限 1', () => {
    const r = computeDamage({
      attacker: { stats: stats({ attack: 3 }), kind: 'test' },
      defender: { stats: stats({ defense: 20 }), kind: 'test' },
      roll: 1,
    });
    expect(r.amount).toBe(MIN_DAMAGE);
  });

  it('暴击触发 1.5 倍伤害', () => {
    const r = computeDamage({
      attacker: { stats: stats({ critChance: 0.5 }), kind: 'test' },
      defender: { stats: stats({}), kind: 'test' },
      roll: 0, // 必然暴击
    });
    expect(r.amount).toBe(Math.round(10 * 1.5));
    expect(r.crit).toBe(true);
  });

  it('暴击率为 0 时不暴击', () => {
    const r = computeDamage({
      attacker: { stats: stats({ critChance: 0 }), kind: 'test' },
      defender: { stats: stats({}), kind: 'test' },
      roll: 0,
    });
    expect(r.crit).toBe(false);
    expect(r.amount).toBe(10);
  });
});
