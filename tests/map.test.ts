/**
 * 战场地图单元测试（data/map）—— 确定性生成与可通行判定
 */
import { describe, expect, it } from 'vitest';
import { generateBattlefieldMap, isWalkableTerrain } from '../src/data/map';

describe('generateBattlefieldMap', () => {
  it('同一种子生成结果一致（确定性）', () => {
    const a = generateBattlefieldMap(42);
    const b = generateBattlefieldMap(42);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.decorations).toEqual(b.decorations);
    expect(a.width).toBe(b.width);
  });

  it('不同种子生成不同布局（装饰数量/位置不同）', () => {
    const a = generateBattlefieldMap(1);
    const b = generateBattlefieldMap(2);
    expect(JSON.stringify(a.decorations)).not.toBe(JSON.stringify(b.decorations));
  });

  it('地形矩形都在地图范围内', () => {
    const map = generateBattlefieldMap();
    for (const r of map.terrain) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(map.width + 0.001);
      expect(r.y + r.h).toBeLessThanOrEqual(map.height + 0.001);
    }
  });

  it('主路与营地可通行，水塘不可通行', () => {
    const map = generateBattlefieldMap();
    expect(map.walkable(10, 18)).toBe(true); // 主路
    expect(map.walkable(5, 5)).toBe(true); // 蓝方营地
    // 找到水塘并验证不可通行
    const pond = map.terrain.find((t) => t.kind === 'water')!;
    expect(isWalkableTerrain('water')).toBe(false);
    expect(map.walkable(pond.x + 0.5, pond.y + 0.5)).toBe(false);
  });

  it('地图外不可通行', () => {
    const map = generateBattlefieldMap();
    expect(map.walkable(-1, 5)).toBe(false);
    expect(map.walkable(5, -1)).toBe(false);
    expect(map.walkable(map.width + 1, 5)).toBe(false);
  });

  it('装饰（树/岩石）占用区域不可通行，旗帜不挡路', () => {
    const map = generateBattlefieldMap();
    const tree = map.decorations.find((d) => d.kind === 'tree')!;
    expect(map.walkable(tree.x, tree.y)).toBe(false);
    const banner = map.decorations.find((d) => d.kind === 'banner')!;
    expect(map.walkable(banner.x, banner.y)).toBe(true);
  });
});
