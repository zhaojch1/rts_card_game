/**
 * 长枪兵配置（data/spearman.ts）—— 需求 13.1 的数据驱动落点。
 *
 * 新增兵种 = 新增一份配置 + 一套矢量定义 + 少量特有逻辑，地基不改（反返工铁律 #4）。
 */
import type { AnimStateConfig, UnitKind, UnitStats } from '../types';

export const SPEARMAN_KIND: UnitKind = 'spearman';

/** 单位属性（与需求 13.1 示例一致） */
export const SPEARMAN_STATS: UnitStats = {
  attack: 15,
  health: 100,
  defense: 5,
  attackSpeed: 1.0,
  moveSpeed: 1.2,
  attackRange: 1.8,
  critChance: 0.1,
};

/** 动画状态 → 动画名映射（anim/stateMachine 消费，动作名与数据对应） */
export const SPEARMAN_ANIM_STATES: readonly AnimStateConfig[] = [
  { state: 'idle', anim: 'idle', loop: true, blend: 0.25 },
  { state: 'walk', anim: 'walk', loop: true, blend: 0.25 },
  { state: 'turn', anim: 'turn', loop: false, blend: 0.12 },
  { state: 'attack', anim: 'attack', loop: false, blend: 0.06 },
  { state: 'block', anim: 'block', loop: false, blend: 0.08 },
  { state: 'hit', anim: 'hit', loop: false, blend: 0.05 },
  { state: 'death', anim: 'death', loop: false, blend: 0.05 },
];

/** 卡牌数据（需求 13.1 JSON 的 TS 形态；阶段 6 部署/回合系统消费） */
export const SPEARMAN_CARD = {
  id: 'spearman_squad',
  name: '长枪兵连',
  description: '基础步兵单位组合，擅长对抗骑兵',
  cost: 5,
  unitType: SPEARMAN_KIND,
  unitCount: 10,
  unitStats: { ...SPEARMAN_STATS },
  type: 'infantry',
  rarity: 'common',
  skills: ['charge'],
  upgradeEffect: { unitCountIncrease: 2, attackIncrease: 10, healthIncrease: 15 },
  roundGrowth: { unitCountPerRound: 2, maxUnits: 20 },
} as const;
