/**
 * PixiJS v8 渲染器实现（render/PixiRenderer.ts）—— IRenderer 的唯一当前实现。
 *
 * WebGL2 渲染（需求 1.2：PixiJS v8 WebGL 渲染器，Canvas 回退由 Pixi 自动处理）。
 * 所有 PixiJS API 的使用都收口在本文件及 render/ 其他实现中，sim/ 与 anim/ 不接触。
 */
import { Application, Container } from 'pixi.js';
import type { IRenderer, IRendererOptions, RenderObject, RenderTransform } from './IRenderer';

export class PixiRenderer implements IRenderer {
  private app!: Application;
  private _width = 0;
  private _height = 0;

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  async init(opts: IRendererOptions): Promise<void> {
    this._width = opts.width;
    this._height = opts.height;
    const app = new Application();
    await app.init({
      canvas: opts.canvas,
      width: opts.width,
      height: opts.height,
      antialias: opts.antialias ?? true,
      background: opts.background ?? 0x0d1410,
      autoStart: false, // 主循环由 core/loop.ts 驱动（固定时间步长）
      preference: 'webgl',
      resolution: 1,
      // 保留绘制缓冲：便于像素级验证/截图（单兵演示无性能压力；多单位阶段按需关闭）
      preserveDrawingBuffer: true,
    });
    this.app = app;
  }

  /** 场景根容器（BattleScene 使用） */
  get root(): Container {
    return this.app.stage;
  }

  render(): void {
    this.app.render();
  }

  resize(w: number, h: number): void {
    this._width = w;
    this._height = h;
    this.app.renderer.resize(w, h);
  }

  createContainer(): RenderObject {
    return new Container();
  }

  addChild(parent: RenderObject, child: RenderObject): void {
    (parent as Container).addChild(child as Container);
  }

  removeChild(parent: RenderObject, child: RenderObject): void {
    (parent as Container).removeChild(child as Container);
  }

  setZIndex(o: RenderObject, z: number): void {
    (o as Container).zIndex = z;
  }

  setSortableChildren(o: RenderObject, v: boolean): void {
    (o as Container).sortableChildren = v;
  }

  setTransform(o: RenderObject, t: RenderTransform): void {
    const c = o as Container;
    if (t.x !== undefined) c.position.x = t.x;
    if (t.y !== undefined) c.position.y = t.y;
    if (t.rotation !== undefined) c.rotation = t.rotation;
    if (t.scaleX !== undefined) c.scale.x = t.scaleX;
    if (t.scaleY !== undefined) c.scale.y = t.scaleY;
    if (t.anchorX !== undefined || t.anchorY !== undefined) {
      const s = o as { anchor: { x: number; y: number } };
      if (t.anchorX !== undefined) s.anchor.x = t.anchorX;
      if (t.anchorY !== undefined) s.anchor.y = t.anchorY;
    }
    if (t.visible !== undefined) c.visible = t.visible;
    if (t.alpha !== undefined) c.alpha = t.alpha;
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
