/**
 * 战斗世界单元测试（sim/battle）—— 胜负判定与单位推进
 */
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { Unit } from '../src/sim/unit';
import { SPEARMAN_STATS } from '../src/data/spearman';

function makeUnit(team: 0 | 1, x: number): Unit {
  return new Unit('spearman', team, { ...SPEARMAN_STATS }, { x, y: 0 });
}

describe('Battle', () => {
  it('单方单位战斗不结束（演示场景持续运行）', () => {
    const unit = makeUnit(0, 0);
    const battle = new Battle([unit]);
    for (let i = 0; i < 600; i++) battle.update(1 / 60); // 10 秒
    expect(battle.result.over).toBe(false);
    expect(battle.units).toHaveLength(1);
  });

  it('一方单位全灭后判定对方获胜', () => {
    const a = makeUnit(0, 0);
    const b = makeUnit(1, 10);
    const battle = new Battle([a, b]);
    // 直接击杀蓝方单位
    a.takeDamage({ amount: 9999, crit: false });
    battle.update(1 / 60);
    expect(battle.result.over).toBe(true);
    expect(battle.result.winner).toBe(1);
  });

  it('同归于尽判定为平局（winner = null）', () => {
    const a = makeUnit(0, 0);
    const b = makeUnit(1, 10);
    const battle = new Battle([a, b]);
    a.takeDamage({ amount: 9999, crit: false });
    b.takeDamage({ amount: 9999, crit: false });
    battle.update(1 / 60);
    expect(battle.result.over).toBe(true);
    expect(battle.result.winner).toBeNull();
  });

  it('死亡单位被清理出 units', () => {
    const a = makeUnit(0, 0);
    const b = makeUnit(1, 10);
    const battle = new Battle([a, b]);
    a.takeDamage({ amount: 9999, crit: false });
    battle.update(1 / 60);
    expect(battle.units).toHaveLength(1);
    expect(battle.units[0]).toBe(b);
  });
});
