/**
 * 摄像机（render/camera.ts）—— 世界坐标 ↔ 屏幕坐标、平移缩放（纯数学，不接触渲染 API）。
 *
 * 约定（阶段 1 统一）：**世界坐标使用"世界像素"**（= 世界单位 × WORLD_SCALE），
 * 与场景根节点/骨骼部件的像素空间一致，避免单位换算歧义：
 *   screen = (worldPx - offset) × scale
 *   offset = 屏幕原点对应的世界像素坐标；scale = 缩放（屏幕像素/世界像素）。
 *
 * 支持视野边界限制：平移/缩放后 offset 被钳制在地图矩形内（含边距）。
 */
import { clamp } from '../utils/math';
import type { Vec2 } from '../types';

export interface CameraBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ICamera {
  readonly scale: number;
  readonly offset: Vec2;
  worldToScreen(p: Vec2): Vec2;
  screenToWorld(p: Vec2): Vec2;
  /** 屏幕像素平移 */
  pan(dx: number, dy: number): void;
  /** 以屏幕点 anchor 为中心缩放 */
  zoomBy(factor: number, anchor?: Vec2): void;
  /** 设置缩放范围 */
  setScaleRange(min: number, max: number): void;
  /** 设置视野尺寸（窗口大小，屏幕像素） */
  setView(w: number, h: number): void;
  /** 设置世界边界（地图矩形，世界像素）与平移边距（像素）；null = 不限 */
  setBounds(bounds: CameraBounds | null, marginPx?: number): void;
}

export class Camera implements ICamera {
  private _scale = 1;
  private _offset: Vec2 = { x: 0, y: 0 };
  private minScale = 0.5;
  private maxScale = 3;
  private viewW = 1280;
  private viewH = 720;
  private bounds: CameraBounds | null = null;
  private marginPx = 0;

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
    this.clampOffset();
  }

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clampOffset();
  }

  setBounds(bounds: CameraBounds | null, marginPx = 0): void {
    this.bounds = bounds ? { ...bounds } : null;
    this.marginPx = marginPx;
    this.clampOffset();
  }

  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this._offset.x) * this._scale, y: (p.y - this._offset.y) * this._scale };
  }

  screenToWorld(p: Vec2): Vec2 {
    return { x: p.x / this._scale + this._offset.x, y: p.y / this._scale + this._offset.y };
  }

  /**
   * 按屏幕像素平移（**内容移动**语义：dx>0 表示内容右移，即"拖拽抓取"操作）。
   * 键盘等"镜头移动"操作（按右箭头=看右侧内容）需取反：camera.pan(-dx, -dy)。
   */
  pan(dx: number, dy: number): void {
    this._offset.x -= dx / this._scale;
    this._offset.y -= dy / this._scale;
    this.clampOffset();
  }

  zoomBy(factor: number, anchor: Vec2 = { x: 0, y: 0 }): void {
    // 保持 anchor 处的世界点不动
    const world = this.screenToWorld(anchor);
    this._scale = clamp(this._scale * factor, this.minScale, this.maxScale);
    this._offset.x = world.x - anchor.x / this._scale;
    this._offset.y = world.y - anchor.y / this._scale;
    this.clampOffset();
  }

  /** 将 offset 钳制在边界内（视野小于边界时居中） */
  private clampOffset(): void {
    if (!this.bounds) return;
    const visW = this.viewW / this._scale;
    const visH = this.viewH / this._scale;
    this._offset.x = clampRange(this._offset.x, this.bounds.x - this.marginPx, this.bounds.x + this.bounds.w - visW + this.marginPx);
    this._offset.y = clampRange(this._offset.y, this.bounds.y - this.marginPx, this.bounds.y + this.bounds.h - visH + this.marginPx);
  }
}

/** 区间钳制：min > max（视野大于地图）时取中点 */
function clampRange(v: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return clamp(v, min, max);
}
