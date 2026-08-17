/**
 * 战场地图渲染（render/map/MapView.ts）—— 阶段 1：像战场的地图。
 *
 * 分层（需求 5.1）：地面（草地/道路/营地/水塘）→ 装饰（树/岩石/军旗）→ 地图描边。
 * 全部为静态 Graphics，只绘制一次（需求 5.4：静态层只画一次）。
 * 单位阴影在 render/ShadowView.ts（shadow 层）。
 */
import { Container, Graphics } from 'pixi.js';
import type { BattleMapDef, TerrainKind } from '../../data/map';
import { WORLD_SCALE } from '../constants';

const COLOR: Record<TerrainKind, number> = {
  grass: 0x2c4a2e,
  path: 0x6b5d47,
  camp_blue: 0x3a4a66,
  camp_red: 0x66424a,
  water: 0x2a4a66,
};

export class MapView {
  /** 地面层（含地形矩形与底色斑块） */
  readonly ground: Container;
  /** 装饰层（树/岩石/军旗，静态） */
  readonly decorations: Container;
  /** 地图描边（边界线） */
  readonly border: Graphics;

  private readonly map: BattleMapDef;

  constructor(map: BattleMapDef) {
    this.map = map;
    this.ground = new Container();
    this.decorations = new Container();
    this.border = new Graphics();
    this.build();
  }

  private build(): void {
    const w = this.map.width * WORLD_SCALE;
    const h = this.map.height * WORLD_SCALE;

    // —— 地面 ——
    const g = new Graphics();
    // 底色 + 斑块（让草地有质感）
    g.rect(0, 0, w, h).fill(COLOR.grass);
    for (let i = 0; i < 60; i++) {
      g.circle(Math.random() * w, Math.random() * h, 14 + Math.random() * 26).fill({
        color: Math.random() < 0.5 ? 0x27422a : 0x33563a,
        alpha: 0.35,
      });
    }
    // 地形矩形（按数据顺序覆盖）
    for (const r of this.map.terrain) {
      const x = r.x * WORLD_SCALE;
      const y = r.y * WORLD_SCALE;
      const rw = r.w * WORLD_SCALE;
      const rh = r.h * WORLD_SCALE;
      if (r.kind === 'water') {
        // 水塘：圆角 + 浅色描边
        g.roundRect(x, y, rw, rh, 14).fill(COLOR.water);
        g.roundRect(x, y, rw, rh, 14).stroke({ color: 0x5d88b0, width: 2 });
        // 波纹
        g.moveTo(x + rw * 0.25, y + rh * 0.4).lineTo(x + rw * 0.45, y + rh * 0.4).stroke({ color: 0x5d88b0, width: 1.5, alpha: 0.5 });
      } else if (r.kind === 'path') {
        // 土路：主色 + 随机斑块
        g.rect(x, y, rw, rh).fill(COLOR.path);
        g.rect(x, y, rw, rh).fill({ color: 0x000000, alpha: 0.06 });
        for (let i = 0; i < rw / 90; i++) {
          g.circle(x + Math.random() * rw, y + Math.random() * rh, 6 + Math.random() * 10).fill({
            color: 0x594b36,
            alpha: 0.4,
          });
        }
      } else {
        g.rect(x, y, rw, rh).fill(COLOR[r.kind]);
        g.rect(x, y, rw, rh).stroke({ color: 0x000000, alpha: 0.12, width: 2 });
      }
    }
    this.ground.addChild(g);

    // —— 装饰 ——
    const d = new Graphics();
    for (const deco of this.map.decorations) {
      const x = deco.x * WORLD_SCALE;
      const y = deco.y * WORLD_SCALE;
      const s = deco.scale;
      switch (deco.kind) {
        case 'tree':
          drawTree(d, x, y, s);
          break;
        case 'rock':
          drawRock(d, x, y, s);
          break;
        case 'banner':
          drawBanner(d, x, y, deco.team ?? 0);
          break;
      }
    }
    this.decorations.addChild(d);

    // —— 描边（战场边界） ——
    this.border.rect(0, 0, w, h).stroke({ color: 0x0d1810, width: 6 });
    // 四角外沿木栅栏感
    this.border.rect(-10, -10, w + 20, h + 20).stroke({ color: 0x16261a, width: 3 });
  }
}

function drawTree(g: Graphics, x: number, y: number, s: number): void {
  // 阴影
  g.ellipse(x, y + 4 * s, 14 * s, 5 * s).fill({ color: 0x000000, alpha: 0.25 });
  // 树干
  g.rect(x - 2.5 * s, y - 18 * s, 5 * s, 20 * s).fill(0x5a4026);
  // 树冠（两层圆）
  g.circle(x, y - 28 * s, 15 * s).fill(0x2f5a30);
  g.circle(x - 8 * s, y - 22 * s, 10 * s).fill(0x376a38);
  g.circle(x + 8 * s, y - 23 * s, 11 * s).fill(0x376a38);
  g.circle(x, y - 32 * s, 10 * s).fill({ color: 0x3d743e });
  // 高光
  g.circle(x - 4 * s, y - 33 * s, 4 * s).fill({ color: 0x4d8a4e, alpha: 0.6 });
}

function drawRock(g: Graphics, x: number, y: number, s: number): void {
  g.ellipse(x, y + 3 * s, 12 * s, 4 * s).fill({ color: 0x000000, alpha: 0.2 });
  g.poly([
    x - 12 * s, y,
    x - 6 * s, y - 10 * s,
    x + 4 * s, y - 12 * s,
    x + 12 * s, y - 4 * s,
    x + 10 * s, y + 2 * s,
    x - 8 * s, y + 3 * s,
  ]).fill(0x6f6a60);
  g.poly([
    x - 12 * s, y,
    x - 6 * s, y - 10 * s,
    x - 2 * s, y - 8 * s,
    x - 6 * s, y + 1 * s,
  ]).fill({ color: 0x858075, alpha: 0.8 });
}

function drawBanner(g: Graphics, x: number, y: number, team: 0 | 1): void {
  const color = team === 0 ? 0x4c8fd6 : 0xd6504a;
  const light = team === 0 ? 0x6fb0ec : 0xe87a72;
  // 旗杆
  g.rect(x - 1.5, y, 3, 46).fill(0x4a3826);
  // 旗帜（三角形）
  g.poly([x + 1.5, y, x + 34, y + 8, x + 1.5, y + 16]).fill(color);
  g.poly([x + 1.5, y, x + 16, y + 4, x + 1.5, y + 8]).fill(light);
  // 旗座
  g.ellipse(x, y + 46, 8, 3).fill(0x3a2f20);
}
