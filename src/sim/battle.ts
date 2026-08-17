/**
 * 战斗世界状态（sim/battle.ts）—— 固定时间步长驱动，逻辑确定可复现。
 *
 * - 持有双方单位、空间索引、回合系统；
 * - update(dt) 推进所有单位（AI 决策由外部注入的 controller 完成，
 *   阶段 3 起默认注入 sim/ai 的 decide）；
 * - 胜负判定（需求 10.5）：一方全部单位被消灭即结束。
 */
import type { TeamId } from '../types';
import { BruteForceSpatial, type SpatialIndex } from './spatial';
import { RoundSystem } from './round';
import type { Unit } from './unit';

export type UnitController = (unit: Unit, battle: Battle, dt: number) => void;

export interface BattleResult {
  over: boolean;
  winner: TeamId | null;
}

export class Battle {
  units: Unit[] = [];
  time = 0;
  readonly spatial: SpatialIndex;
  readonly round: RoundSystem;
  /** 参战队伍（按首次出现顺序；胜负判定基于"某队全灭"而非"只剩一队"） */
  readonly teams: TeamId[];

  private _result: BattleResult = { over: false, winner: null };

  constructor(units: readonly Unit[] = [], controller?: UnitController) {
    this.units = [...units];
    const seen = new Set<TeamId>();
    for (const u of this.units) seen.add(u.team);
    this.teams = [...seen];
    this.spatial = new BruteForceSpatial();
    this.round = new RoundSystem();
    this.controller = controller ?? null;
  }

  /** 单位 AI 控制器（阶段 3 注入 ai.decide；演示场景可注入巡逻等自定义逻辑） */
  controller: UnitController | null;

  addUnit(u: Unit): void {
    this.units.push(u);
  }

  update(dt: number): void {
    if (this._result.over) return;
    this.time += dt;
    this.spatial.rebuild(this.units);

    // 1. 决策 + 状态推进
    for (const u of this.units) {
      if (!u.alive) continue;
      u.prevPos = { ...u.pos };
      if (this.controller) this.controller(u, this, dt);
    }

    // 2. 清理死亡单位 + 胜负判定（需求 10.5：一方全部单位被消灭即结束）
    this.units = this.units.filter((u) => u.alive);
    const aliveByTeam = new Map<TeamId, number>();
    for (const u of this.units) {
      aliveByTeam.set(u.team, (aliveByTeam.get(u.team) ?? 0) + 1);
    }
    for (const team of this.teams) {
      if ((aliveByTeam.get(team) ?? 0) === 0) {
        // 该队被全灭
        const survivorSet = new Set<TeamId>();
        for (const u of this.units) survivorSet.add(u.team);
        this._result = {
          over: true,
          winner: survivorSet.size === 1 ? [...survivorSet][0]! : null, // 双方同归于尽 → 平局
        };
        break;
      }
    }
  }

  get result(): BattleResult {
    return this._result;
  }

  getUnitsByTeam(team: TeamId): Unit[] {
    return this.units.filter((u) => u.team === team);
  }
}
