/**
 * 战场背景（render/background.ts）—— 阶段 0 的最小草地；阶段 1 在此扩展为完整地图。
 * 使用 Pixi Graphics 绘制（render/ 内部允许接触渲染 API）。
 */
import { Container, Graphics } from 'pixi.js';

/** 生成一片草地背景（尺寸为世界像素） */
export function createGrassBackground(w: number, h: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.rect(0, 0, w, h).fill(0x2c4a2e);

  // 随机草丛色块（静态层，只绘制一次）
  for (let i = 0; i < 28; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 20 + Math.random() * 36;
    const color = Math.random() < 0.5 ? 0x27422a : 0x33563a;
    g.circle(x, y, r).fill({ color, alpha: 0.55 });
  }

  // 中央一条土路（阶段 1 重做为路径系统）
  const road = new Graphics();
  road.rect(w * 0.42, 0, w * 0.16, h).fill(0x4a4236);
  road.rect(w * 0.42, 0, w * 0.16, h).fill({ color: 0x000000, alpha: 0.08 });
  c.addChild(road);
  c.addChild(g);
  return c;
}
