/**
 * 回合与增长系统（sim/round.ts）—— 需求 10.1.4 / 13.3。
 *
 * 阶段 6（卡牌/部署/回合）启用；阶段 0 先提供结构与状态。
 * 每回合开始，已部署卡牌自动增加单位数量（增长量受卡牌等级影响）。
 */
export interface RoundGrowthConfig {
  /** 每回合增长的单位数量 */
  unitCountPerRound: number;
  /** 该卡牌在场单位数量上限 */
  maxUnits: number;
}

export class RoundSystem {
  private _round = 1;

  get round(): number {
    return this._round;
  }

  /** 推进到下一回合，返回新的回合数 */
  advance(): number {
    this._round++;
    return this._round;
  }

  /** 计算某卡牌本回合应增长的单位数量（阶段 6 接入部署状态后使用） */
  computeGrowth(config: RoundGrowthConfig, currentCount: number): number {
    if (currentCount >= config.maxUnits) return 0;
    return Math.min(config.unitCountPerRound, config.maxUnits - currentCount);
  }
}
