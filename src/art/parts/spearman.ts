/**
 * 长枪兵矢量部件（art/parts/spearman.ts）—— 需求 7.4 形象草案的程序化实现。
 *
 * 每个部件以"骨骼挂点"为原点 (0,0) 绘制（y 向下为正），
 * 蓝图配色：蓝方钢甲 + 木杆铁枪头（阶段 5 起支持颜色混合动态着色）。
 * 阶段 2：增加脚掌部件，手臂/腿分段更细（上臂/前臂+手、大腿+小腿/脚）。
 */

import type { PartDef } from '../bake';
import { fillCircle, fillEllipse, fillPoly, fillRect, fillRoundRect, linearGradient, strokeLine } from '../vector';

const OUTLINE = 'rgba(8,12,18,0.55)';

/** 头：圆形 + 头盔（金属渐变）+ 盔缨 */
function drawHead(ctx: CanvasRenderingContext2D): void {
  // 颈甲
  fillRoundRect(ctx, -4, -2, 8, 4, 2, { fill: '#5d6b7d', stroke: OUTLINE, lineWidth: 1 });
  // 脸
  fillCircle(ctx, 0, -7, 6.5, { fill: '#e8c39e', stroke: OUTLINE, lineWidth: 1 });
  // 头盔（半球）
  const helm = linearGradient(ctx, -7, -14, 7, -4, [
    [0, '#aab6c2'],
    [0.6, '#7c8896'],
    [1, '#55616f'],
  ]);
  fillCircle(ctx, 0, -7.5, 6.5, { fill: helm, stroke: OUTLINE, lineWidth: 1 });
  // 盔沿
  fillRoundRect(ctx, -7, -11.5, 14, 3, 1.5, { fill: '#6b7886', stroke: OUTLINE, lineWidth: 0.8 });
  // 盔缨
  fillPoly(
    ctx,
    [
      [0, -14],
      [3.5, -19],
      [0, -18],
      [-3.5, -19],
    ],
    { fill: '#b3302e', stroke: OUTLINE, lineWidth: 0.8 },
  );
  // 护鼻
  fillRect(ctx, -0.8, -6, 1.6, 4, { fill: '#7c8896' });
}

/** 躯干：梯形铠甲 + 肩甲 + 腰带 */
function drawTorso(ctx: CanvasRenderingContext2D): void {
  // 铠甲主体（上窄下宽的梯形，顶部在 y=-18 = 颈，底部在 y=0 = 腰）
  const armor = linearGradient(ctx, -10, -18, 10, 0, [
    [0, '#4d6f9e'],
    [0.55, '#38537c'],
    [1, '#263a58'],
  ]);
  fillPoly(
    ctx,
    [
      [-6, -18],
      [6, -18],
      [9, 0],
      [-9, 0],
    ],
    { fill: armor, stroke: OUTLINE, lineWidth: 1.2 },
  );
  // 胸甲中线
  strokeLine(ctx, 0, -16, 0, -2, 'rgba(255,255,255,0.14)', 2);
  // 腰带
  fillRect(ctx, -9.5, -3.5, 19, 4, { fill: '#8a6a3f', stroke: OUTLINE, lineWidth: 0.8 });
  fillRect(ctx, -1.6, -3.5, 3.2, 4, { fill: '#c8a24a', stroke: OUTLINE, lineWidth: 0.6 });
  // 肩甲
  fillRoundRect(ctx, -9.5, -17.5, 5, 6, 2, { fill: '#6b7886', stroke: OUTLINE, lineWidth: 0.8 });
}

/** 上臂（挂点=肩关节，向下延伸 12px） */
function drawArm(ctx: CanvasRenderingContext2D): void {
  const grad = linearGradient(ctx, -4, 0, 4, 12, [
    [0, '#4d6f9e'],
    [1, '#2c4060'],
  ]);
  fillRoundRect(ctx, -3.2, 0, 6.4, 12, 3, { fill: grad, stroke: OUTLINE, lineWidth: 0.9 });
  // 肩垫
  fillCircle(ctx, 0, 1.5, 4.2, { fill: '#6b7886', stroke: OUTLINE, lineWidth: 0.8 });
}

/** 前臂+手（挂点=肘，向下延伸 12px，末端手掌） */
function drawHand(ctx: CanvasRenderingContext2D): void {
  const grad = linearGradient(ctx, -3, 0, 3, 10, [
    [0, '#38537c'],
    [1, '#2a3d5c'],
  ]);
  fillRoundRect(ctx, -2.6, 0, 5.2, 10, 2.5, { fill: grad, stroke: OUTLINE, lineWidth: 0.8 });
  fillCircle(ctx, 0, 11, 2.5, { fill: '#e8c39e', stroke: OUTLINE, lineWidth: 0.6 });
}

/** 腿（大腿+小腿，挂点=髋，向下延伸 18px，末端接脚掌） */
function drawLeg(ctx: CanvasRenderingContext2D): void {
  const grad = linearGradient(ctx, -4, 0, 4, 18, [
    [0, '#33466a'],
    [1, '#22304a'],
  ]);
  // 大腿+小腿（锥形）
  fillPoly(
    ctx,
    [
      [-3.6, 0],
      [3.6, 0],
      [3.2, 14],
      [-3.2, 14],
    ],
    { fill: grad, stroke: OUTLINE, lineWidth: 0.9 },
  );
  // 护膝
  fillEllipse(ctx, 0, 10.5, 3.4, 2.6, { fill: '#5d6b7d', stroke: OUTLINE, lineWidth: 0.6 });
}

/** 脚掌（靴子，挂点=踝，向下延伸 5px） */
function drawFoot(ctx: CanvasRenderingContext2D): void {
  fillPoly(
    ctx,
    [
      [-3.2, 0],
      [3.2, 0],
      [4.2, 4],
      [1.6, 5],
      [-3.4, 4.4],
    ],
    { fill: '#4a3826', stroke: OUTLINE, lineWidth: 0.8 },
  );
}

/** 长枪（挂点=持枪手，枪杆沿 +x，枪头在最远端） */
function drawSpear(ctx: CanvasRenderingContext2D): void {
  // 枪杆（木）
  const wood = linearGradient(ctx, 0, -1.2, 44, 1.2, [
    [0, '#9a7a49'],
    [0.5, '#7d5f36'],
    [1, '#5f4726'],
  ]);
  fillPoly(
    ctx,
    [
      [0, -1.6],
      [44, -1.3],
      [44, 1.3],
      [0, 1.6],
    ],
    { fill: wood, stroke: OUTLINE, lineWidth: 0.6 },
  );
  // 枪缨
  fillPoly(
    ctx,
    [
      [2, -2.4],
      [12, 0],
      [2, 2.4],
    ],
    { fill: '#b3302e', stroke: OUTLINE, lineWidth: 0.5 },
  );
  // 枪头（菱形金属）
  const metal = linearGradient(ctx, 44, -4, 58, 4, [
    [0, '#e8edf2'],
    [0.6, '#b7c1cb'],
    [1, '#8b97a3'],
  ]);
  fillPoly(
    ctx,
    [
      [44, -4.2],
      [52, 0],
      [44, 4.2],
      [57.5, 0],
    ],
    { fill: metal, stroke: OUTLINE, lineWidth: 0.8 },
  );
}

export const SPEARMAN_PARTS: PartDef[] = [
  { name: 'head', w: 20, h: 22, draw: drawHead },
  { name: 'torso', w: 22, h: 20, draw: drawTorso },
  { name: 'arm_l', w: 12, h: 16, draw: drawArm },
  { name: 'arm_r', w: 12, h: 16, draw: drawArm },
  { name: 'hand_l', w: 10, h: 15, draw: drawHand },
  { name: 'hand_r', w: 10, h: 15, draw: drawHand },
  { name: 'leg_l', w: 12, h: 20, draw: drawLeg },
  { name: 'leg_r', w: 12, h: 20, draw: drawLeg },
  { name: 'foot_l', w: 12, h: 8, draw: drawFoot },
  { name: 'foot_r', w: 12, h: 8, draw: drawFoot },
  { name: 'weapon', w: 62, h: 12, draw: drawSpear },
];
