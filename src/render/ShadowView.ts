/**
 * 单位贴地阴影（render/ShadowView.ts）—— 需求 5.1 阴影层 / 阶段 1 验收"单位贴地"。
 *
 * 单位脚下的椭圆投影，随单位位置移动；静态 Graphics 复用，每帧只改位置。
 */
import { Container, Graphics } from 'pixi.js';

export class ShadowView {
  readonly container: Container;
  private readonly g: Graphics;

  constructor(radiusX = 16, radiusY = 6) {
    this.container = new Container();
    this.g = new Graphics();
    this.g.ellipse(0, 0, radiusX, radiusY).fill({ color: 0x000000, alpha: 0.32 });
    this.container.addChild(this.g);
  }

  /** 世界像素坐标（单位脚底） */
  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  set visible(v: boolean) {
    this.container.visible = v;
  }
}
