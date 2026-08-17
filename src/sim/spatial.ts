/**
 * 空间分区（sim/spatial.ts）—— 需求 11.3。
 *
 * 阶段 0–3 单位数量少，用 O(n) 蛮力查询即可；阶段 5（200 单位）起换四叉树实现。
 * 通过接口隔离，调用方不感知实现差异。
 */
import type { Unit } from './unit';

export interface SpatialIndex {
  /** 查询某点附近半径内的单位 */
  query(x: number, y: number, radius: number, predicate?: (u: Unit) => boolean): Unit[];
  /** 全量重建（单位移动后调用；阶段 5 优化为增量更新） */
  rebuild(units: readonly Unit[]): void;
}

/** O(n) 蛮力实现（当前阶段使用） */
export class BruteForceSpatial implements SpatialIndex {
  private units: readonly Unit[] = [];

  rebuild(units: readonly Unit[]): void {
    this.units = units;
  }

  query(x: number, y: number, radius: number, predicate?: (u: Unit) => boolean): Unit[] {
    const r2 = radius * radius;
    const out: Unit[] = [];
    for (const u of this.units) {
      if (!u.alive) continue;
      if (predicate && !predicate(u)) continue;
      const dx = u.pos.x - x;
      const dy = u.pos.y - y;
      if (dx * dx + dy * dy <= r2) out.push(u);
    }
    return out;
  }
}
