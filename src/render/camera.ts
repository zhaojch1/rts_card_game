/**
 * 摄像机（render/camera.ts）—— 世界坐标 ↔ 屏幕坐标、平移缩放（纯数学，不接触渲染 API）。
 *
 * 约定：screen = (world - offset) * scale；
 *       offset 为"屏幕原点对应的世界坐标"；scale 为缩放（px/世界单位）。
 */
import { clamp } from '../utils/math';
import type { Vec2 } from '../types';

export interface ICamera {
  readonly scale: number;
  readonly offset: Vec2;
  worldToScreen(p: Vec2): Vec2;
  screenToWorld(p: Vec2): Vec2;
  /** 屏幕像素平移 */
  pan(dx: number, dy: number): void;
  /** 以屏幕点 anchor 为中心缩放 */
  zoomBy(factor: number, anchor?: Vec2): void;
  /** 限制缩放范围 */
  setScaleRange(min: number, max: number): void;
}

export class Camera implements ICamera {
  private _scale = 1;
  private _offset: Vec2 = { x: 0, y: 0 };
  private minScale = 0.5;
  private maxScale = 3;

  constructor(scale = 1, offset: Vec2 = { x: 0, y: 0 }) {
    this._scale = scale;
    this._offset = { ...offset };
  }

  get scale(): number {
    return this._scale;
  }

  get offset(): Vec2 {
    return this._offset;
  }

  setScaleRange(min: number, max: number): void {
    this.minScale = min;
    this.maxScale = max;
    this._scale = clamp(this._scale, min, max);
  }

  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this._offset.x) * this._scale, y: (p.y - this._offset.y) * this._scale };
  }

  screenToWorld(p: Vec2): Vec2 {
    return { x: p.x / this._scale + this._offset.x, y: p.y / this._scale + this._offset.y };
  }

  pan(dx: number, dy: number): void {
    this._offset.x -= dx / this._scale;
    this._offset.y -= dy / this._scale;
  }

  zoomBy(factor: number, anchor: Vec2 = { x: 0, y: 0 }): void {
    // 保持 anchor 处的世界点不动
    const world = this.screenToWorld(anchor);
    this._scale = clamp(this._scale * factor, this.minScale, this.maxScale);
    this._offset.x = world.x - anchor.x / this._scale;
    this._offset.y = world.y - anchor.y / this._scale;
  }
}
