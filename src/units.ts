import { SPEAR_LEN, SPEAR_LEAN } from './art/spearman';

/**
 * 兵种数据注册表（数据驱动"内核"的第一步）。
 * 加新兵种 = 在 art/ 里写 drawXxx + 在这里加一条配置，DemoScene 无需再改分支。
 * 近战武器只要定义"握持点 + 武器长度 + 滑枪位"，距离控制 / 瞄准自动生效。
 *
 * 当前为对战测试场景：长枪兵（A 阵营）vs 剑士（B 阵营），互为敌对。
 */

export type UnitKind = 'spearman' | 'swordsman';
/** 阵营：a = 长枪兵方（绿），b = 剑士方（红），互相敌对 */
export type Team = 'a' | 'b';

export interface UnitStats {
  kind: UnitKind;
  name: string;
  team: Team;
  hp: number;
  speed: number;
  damage: number;
  /** 索敌半径（0 = 不主动索敌） */
  aggro: number;
  /** 后退速度系数（保持距离时倒着走，慢速） */
  retreatFactor: number;

  // ---- 武器 / 几何 ----
  /** 握持点（局部坐标，正 = 朝前） */
  handX: number;
  /** 握持点（局部坐标，负 = 向上） */
  handY: number;
  /** 武器全长（长枪兵 172、剑士 46；改它距离算法自动跟着变） */
  weaponLen: number;
  /** 待机武器前倾角（弧度） */
  restLean: number;
  /** 待机握枪位（手到武器尾端距离） */
  gripRest: number;
  /** 回缩握枪位（武器尾端后探） */
  gripRetract: number;
  /** 刺出握枪位（武器向前滑出） */
  gripStab: number;

  // ---- 命中 / 拾取 / 血条 ----
  /** 目标中心在脚上方的距离 */
  targetCenter: number;
  /** 血条在脚上方的偏移 */
  hpBarY: number;
  /** 拾取判定中心在脚上方的偏移 */
  pickOffset: number;
}

export const UNIT_TYPES: Record<UnitKind, UnitStats> = {
  spearman: {
    kind: 'spearman',
    name: '长矛兵',
    team: 'a',
    hp: 100,
    speed: 230,
    damage: 18,
    aggro: 900,
    retreatFactor: 0.7, // 长枪兵的 keepRange 对"太近"不后退（见 DemoScene）；贴脸应对是后撤步，此项对长枪兵无效
    handX: 9,
    handY: -28,
    weaponLen: SPEAR_LEN,
    restLean: SPEAR_LEAN,
    gripRest: 30,
    gripRetract: 50,
    gripStab: 14,
    targetCenter: 30,
    hpBarY: 92,
    pickOffset: 40,
  },
  swordsman: {
    kind: 'swordsman',
    name: '剑士',
    team: 'b',
    hp: 170,
    speed: 280,
    damage: 24, // 攻击更高；对长枪兵还有 1.5 倍加成（见 DemoScene applyHit）
    aggro: 900,
    retreatFactor: 0.7,
    handX: 10,
    handY: -36,
    weaponLen: 46,
    restLean: 0.25, // 待机剑近乎竖直，藏于身体与盾牌之后（只露剑尖）
    gripRest: 10,
    gripRetract: 15,
    gripStab: 6,
    targetCenter: 28,
    hpBarY: 86,
    pickOffset: 38,
  },
};
