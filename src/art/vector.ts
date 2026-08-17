/**
 * 程序化矢量绘制原语（art/vector.ts）
 *
 * 纯 Canvas 2D 绘制辅助：圆形、矩形、多边形、路径、渐变、描边。
 * 所有兵种部件由这些原语组合而成，无外部图片资源（需求 7.1）。
 * 部件坐标系：以"骨骼挂点"为原点 (0,0)，y 向下为正。
 */

export interface Style {
  fill?: string | CanvasGradient;
  stroke?: string;
  lineWidth?: number;
}

export type GradientStop = [offset: number, color: string];

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  return canvas;
}

export function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[art] 无法创建 Canvas2D 上下文');
  return ctx;
}

export function linearGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: GradientStop[],
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function applyStyle(ctx: CanvasRenderingContext2D, s?: Style): void {
  if (!s) return;
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke) {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.lineWidth ?? 1;
    ctx.stroke();
  }
}

export function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s?: Style): void {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  applyStyle(ctx, s);
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  s?: Style,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  applyStyle(ctx, s);
}

export function fillCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s?: Style): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  applyStyle(ctx, s);
}

export function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, s?: Style): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  applyStyle(ctx, s);
}

/** 多边形（pts: [x,y] 数组，首尾自动闭合） */
export function fillPoly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], s?: Style): void {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  applyStyle(ctx, s);
}

/** 线段 */
export function strokeLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 1): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** 二次贝塞尔路径填充 */
export function fillQuadCurve(
  ctx: CanvasRenderingContext2D,
  pts: readonly (readonly [number, number])[],
  s?: Style,
): void {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i + 1 < pts.length; i += 2) {
    ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
  }
  ctx.closePath();
  applyStyle(ctx, s);
}
