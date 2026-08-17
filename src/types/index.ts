/**
 * 共享类型契约（types/）—— sim / anim / render / game 之间的唯一数据契约。
 * 本模块不依赖任何渲染 API 与 DOM。
 */

/** 2D 向量（世界坐标，y 向下为正，与渲染一致） */
export interface Vec2 {
  x: number;
  y: number;
}

/** 阵营：0 = 蓝方（己方），1 = 红方（敌方） */
export type TeamId = 0 | 1;

/** 基础兵种类型（阶段 4 起扩展弓箭手等） */
export type UnitKind = 'spearman';

/** 单位基础属性 */
export interface UnitStats {
  /** 攻击力 */
  attack: number;
  /** 生命值上限 */
  health: number;
  /** 防御力 */
  defense: number;
  /** 攻击速度（次/秒） */
  attackSpeed: number;
  /** 移动速度（世界单位/秒） */
  moveSpeed: number;
  /** 攻击范围（世界单位） */
  attackRange: number;
  /** 暴击率 0..1 */
  critChance: number;
}

/** 单位动画状态（与第 9 章动作清单一致） */
export type UnitAnimState =
  | 'idle'
  | 'walk'
  | 'turn'
  | 'attack'
  | 'block'
  | 'hit'
  | 'death';

/** 单位朝向 */
export interface Facing {
  /** 单位在 x 轴上的朝向：1 = 右，-1 = 左（2D 战棋用水平翻转表现朝向） */
  dirX: 1 | -1;
}

/** 伤害结算结果 */
export interface DamageResult {
  amount: number;
  crit: boolean;
}

/** 动画配置（data/ 驱动，anim/stateMachine 消费） */
export interface AnimStateConfig {
  /** 状态名（必须与 UnitAnimState 一致） */
  state: UnitAnimState;
  /** 动画名（对应 DragonBones 数据中的 animation.name） */
  anim: string;
  /** 是否循环 */
  loop: boolean;
  /** 状态切换时的混合时长（秒） */
  blend: number;
}

/** 世界坐标范围（相机边界、战场边界） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
