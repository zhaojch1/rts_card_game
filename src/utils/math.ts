/**
 * 通用数学工具（utils/）—— 纯函数，无副作用。
 */

import type { Vec2 } from '../types';

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** 最短路径角度插值（弧度），避免绕圈 */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return a + diff * t;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function distVec2(a: Vec2, b: Vec2): number {
  return dist(a.x, a.y, b.x, b.y);
}

export function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function rad2deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function length(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
