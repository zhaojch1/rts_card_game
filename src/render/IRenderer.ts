/**
 * 渲染接口（render/IRenderer.ts）—— 反返工铁律 #1/#2 的落点。
 *
 * 游戏逻辑（sim/）禁止出现任何渲染 API 调用；一切绘制收口到 render/ 模块。
 * 本接口描述"渲染器能力"，PixiRenderer 是当前实现；未来更换渲染底层只改 render/ 内部。
 */

/** 不透明渲染对象句柄（容器/精灵等） */
export type RenderObject = object;

export interface RenderTransform {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  anchorX?: number;
  anchorY?: number;
  visible?: boolean;
  alpha?: number;
}

export interface IRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  antialias?: boolean;
  /** 背景色（0xRRGGBB） */
  background?: number;
}

export interface IRenderer {
  readonly width: number;
  readonly height: number;

  init(opts: IRendererOptions): Promise<void>;

  /** 渲染一帧（当前舞台全部内容） */
  render(): void;

  resize(w: number, h: number): void;

  createContainer(): RenderObject;

  addChild(parent: RenderObject, child: RenderObject): void;
  removeChild(parent: RenderObject, child: RenderObject): void;

  /** 设置容器 zIndex（需 setSortableChildren(true) 生效） */
  setZIndex(o: RenderObject, z: number): void;
  setSortableChildren(o: RenderObject, v: boolean): void;

  setTransform(o: RenderObject, t: RenderTransform): void;

  destroy(): void;
}
