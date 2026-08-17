/**
 * 分层渲染（render/layers.ts）—— 需求 5.1。
 *
 * 背景 → 阴影 → 单位 → 特效 → UI，固定顺序分层，便于隔离与优化；
 * 静态层（背景）只重绘一次，动态层（单位/特效）每帧更新。
 */
import type { IRenderer, RenderObject } from './IRenderer';

export type LayerName = 'background' | 'shadow' | 'unit' | 'effect' | 'ui';

export const LAYER_ORDER: readonly LayerName[] = ['background', 'shadow', 'unit', 'effect', 'ui'];

export class Layers {
  private readonly map = new Map<LayerName, RenderObject>();

  constructor(private readonly renderer: IRenderer, root: RenderObject) {
    LAYER_ORDER.forEach((name, i) => {
      const c = renderer.createContainer();
      renderer.setZIndex(c, i);
      renderer.addChild(root, c);
      this.map.set(name, c);
    });
  }

  get(name: LayerName): RenderObject {
    const c = this.map.get(name);
    if (!c) throw new Error(`[render] 未知图层 ${name}`);
    return c;
  }

  addChildTo(name: LayerName, child: RenderObject): void {
    this.renderer.addChild(this.get(name), child);
  }

  removeChildFrom(name: LayerName, child: RenderObject): void {
    this.renderer.removeChild(this.get(name), child);
  }
}
