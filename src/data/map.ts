/**
 * 战场地图数据（data/map.ts）—— 阶段 1：一张"像战场"的地图。
 *
 * 数据驱动：地形矩形 + 装饰点 + 可通行判定；
 * 程序化生成（确定性，种子固定则结果固定），便于测试与复现。
 * 渲染由 render/map/MapView.ts 消费（本模块不含渲染 API）。
 */
import type { TeamId, Vec2 } from '../types';

export type TerrainKind = 'grass' | 'path' | 'camp_blue' | 'camp_red' | 'water';

export interface TerrainRect {
  kind: TerrainKind;
  /** 世界单位（y 向下） */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DecorationKind = 'tree' | 'rock' | 'banner';

export interface MapDecoration {
  kind: DecorationKind;
  x: number;
  y: number;
  /** 世界单位；树/岩石占用半径（不可通行） */
  radius: number;
  team?: TeamId;
  scale: number;
}

export interface BattleMapDef {
  name: string;
  /** 世界单位 */
  width: number;
  height: number;
  /** 按绘制顺序（数组靠后覆盖靠前） */
  terrain: TerrainRect[];
  decorations: MapDecoration[];
  /** 某世界坐标是否可通行（地形 + 装饰占用） */
  walkable(x: number, y: number): boolean;
  /** 查找某坐标最上层地形 */
  terrainAt(x: number, y: number): TerrainKind;
}

/** 不可通行的地形 */
const BLOCKED_TERRAIN: ReadonlySet<TerrainKind> = new Set(['water']);

export function isWalkableTerrain(kind: TerrainKind): boolean {
  return !BLOCKED_TERRAIN.has(kind);
}

// —— 确定性随机（mulberry32） ——

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// —— 战场生成 ——

const MAP_W = 60;
const MAP_H = 38;

/** 生成一张"像战场"的地图：十字土路 + 双方营地 + 水塘 + 树林/岩石/军旗 */
export function generateBattlefieldMap(seed = 20260817): BattleMapDef {
  const rand = mulberry32(seed);

  const terrain: TerrainRect[] = [
    // 草地基底
    { kind: 'grass', x: 0, y: 0, w: MAP_W, h: MAP_H },
  ];

  // 主路（横向）与辅路（纵向）—— 十字路
  terrain.push({ kind: 'path', x: 0, y: 17.2, w: MAP_W, h: 2.2 });
  terrain.push({ kind: 'path', x: 28.5, y: 0, w: 2.2, h: MAP_H });

  // 双方营地（地面色块）
  terrain.push({ kind: 'camp_blue', x: 1.5, y: 1.5, w: 12, h: 9 });
  terrain.push({ kind: 'camp_red', x: MAP_W - 13.5, y: MAP_H - 10.5, w: 12, h: 9 });

  // 水塘（两处）
  terrain.push({ kind: 'water', x: 6 + rand() * 2, y: 25 + rand() * 2, w: 6, h: 3.6 });
  terrain.push({ kind: 'water', x: 44 + rand() * 2, y: 6 + rand() * 2, w: 5, h: 3.2 });

  // 装饰：树林（聚集）、岩石、军旗
  const decorations: MapDecoration[] = [];
  // 树林簇 1（左下）
  for (let i = 0; i < 6; i++) {
    decorations.push({
      kind: 'tree',
      x: 9 + rand() * 7,
      y: 30 + rand() * 5,
      radius: 1.1,
      scale: 0.9 + rand() * 0.5,
    });
  }
  // 树林簇 2（右上）
  for (let i = 0; i < 5; i++) {
    decorations.push({
      kind: 'tree',
      x: 44 + rand() * 6,
      y: 27 + rand() * 5,
      radius: 1.1,
      scale: 0.9 + rand() * 0.5,
    });
  }
  // 岩石（散布）
  for (let i = 0; i < 5; i++) {
    decorations.push({
      kind: 'rock',
      x: 14 + rand() * 34,
      y: 3 + rand() * 32,
      radius: 0.8,
      scale: 0.8 + rand() * 0.6,
    });
  }
  // 军旗（双方营地）
  decorations.push({ kind: 'banner', x: 7.5, y: 6, radius: 0.3, team: 0, scale: 1 });
  decorations.push({ kind: 'banner', x: MAP_W - 7.5, y: MAP_H - 6, radius: 0.3, team: 1, scale: 1 });

  return {
    name: `battlefield_${seed}`,
    width: MAP_W,
    height: MAP_H,
    terrain,
    decorations,
    walkable(x, y) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
      const kind = terrainAt(x, y, terrain);
      if (!isWalkableTerrain(kind)) return false;
      for (const d of decorations) {
        if (d.kind === 'banner') continue; // 旗帜不挡路
        const dx = x - d.x;
        const dy = y - d.y;
        if (dx * dx + dy * dy <= d.radius * d.radius) return false;
      }
      return true;
    },
    terrainAt(x, y) {
      return terrainAt(x, y, terrain);
    },
  };
}

function terrainAt(x: number, y: number, terrain: readonly TerrainRect[]): TerrainKind {
  // 数组靠后 = 更上层，从后往前找第一个包含该点的矩形
  for (let i = terrain.length - 1; i >= 0; i--) {
    const r = terrain[i]!;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.kind;
  }
  return 'grass';
}

/** 供调用方方便使用的辅助：单位位置是否可通行 */
export function isWalkable(def: BattleMapDef, p: Vec2): boolean {
  return def.walkable(p.x, p.y);
}
