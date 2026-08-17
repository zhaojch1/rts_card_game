/**
 * 单位（sim/unit.ts）—— 纯逻辑状态与属性，禁止 import 渲染。
 *
 * 单位由 sim/ai 驱动决策、sim/combat 结算伤害；
 * 动画状态（animState）由本层产出信号，anim/ 状态机消费（逻辑与表现解耦）。
 */
import type { DamageResult, TeamId, UnitAnimState, UnitKind, UnitStats, Vec2 } from '../types';
import { computeDamage, type CombatContext } from './combat';

let nextUnitId = 1;

export class Unit {
  readonly id: number;
  readonly team: TeamId;
  readonly kind: UnitKind;
  readonly stats: UnitStats;

  /** 当前位置（世界单位） */
  pos: Vec2 = { x: 0, y: 0 };
  /** 上一逻辑帧位置（供渲染插值） */
  prevPos: Vec2 = { x: 0, y: 0 };

  /** 朝向：1 = +x（右），-1 = -x（左） */
  dirX: 1 | -1 = 1;

  hp: number;
  alive = true;

  /** 当前动画状态（sim 产出信号） */
  animState: UnitAnimState = 'idle';

  /** 攻击冷却计时（秒） */
  attackTimer = 0;

  /** 当前目标（由 AI 索敌设置） */
  target: Unit | null = null;

  constructor(kind: UnitKind, team: TeamId, stats: UnitStats, pos: Vec2) {
    this.id = nextUnitId++;
    this.kind = kind;
    this.team = team;
    this.stats = { ...stats };
    this.hp = stats.health;
    this.pos = { ...pos };
    this.prevPos = { ...pos };
  }

  get attackRange(): number {
    return this.stats.attackRange;
  }

  get attackInterval(): number {
    return 1 / this.stats.attackSpeed;
  }

  /** 索敌范围：以攻击范围为基础（阶段 3 可扩展视野概念） */
  get visionRange(): number {
    return this.stats.attackRange * 2;
  }

  /** 受击结算（攻击方伤害由 combat.computeDamage 计算） */
  takeDamage(dmg: DamageResult): { killed: boolean } {
    if (!this.alive) return { killed: false };
    this.hp = Math.max(0, this.hp - dmg.amount);
    if (this.hp <= 0) {
      this.alive = false;
      return { killed: true };
    }
    return { killed: false };
  }

  /** 计算一次对 defender 的伤害（供 AI/战斗循环调用） */
  attackRoll(defender: Unit, roll: number): DamageResult {
    const ctx: CombatContext = {
      attacker: { stats: this.stats, kind: this.kind },
      defender: { stats: defender.stats, kind: defender.kind },
      roll,
    };
    return computeDamage(ctx);
  }

  /** 面向目标（水平翻转朝向） */
  faceTo(target: Vec2): void {
    if (target.x > this.pos.x) this.dirX = 1;
    else if (target.x < this.pos.x) this.dirX = -1;
  }
}
