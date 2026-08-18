import * as Phaser from 'phaser';

/**
 * 共享美术模块：长枪兵（侧身暗黑系 v5 定稿）+ 史莱姆靶子
 * 动画全部由参数驱动，配合 Graphics 画布变换（平移/镜像/旋转）实现完整动作：
 *  - bob      竖直弹跳（走路/呼吸）
 *  - rot      整体旋转（绕脚点；攻击前倾、死亡倒下）
 *  - xShift   水平位移（突进/击退）
 *  - legSwing/legLift  单腿摆动与抬腿（走路）
 *  - spearLean/spearExtend  长枪前倾与伸长（突刺）
 *  - capeSway 披风下摆摆动
 *  - flash    受击闪白
 *  - eyeGlow  眼睛发光强度
 */

export interface SpearmanConfig {
  bodyW: number;
  bodyH: number;
  headR: number;
  helmet: 'crest' | 'horn' | 'plume' | 'visor' | 'hood';
  cape: 'long' | 'short' | 'ragged' | 'draped';
  accent: number;
  fullHood?: boolean;
  spearLen?: number;
}

export interface SpearmanAnim {
  flip?: 1 | -1;
  bob?: number;
  rot?: number;
  xShift?: number;
  legSwing?: number;
  legLift?: number;
  spearLean?: number;
  spearExtend?: number;
  grip?: number; // 手到枪尾的距离（滑枪：回缩变大、刺出变小）
  capeSway?: number;
  flash?: number;
  eyeGlow?: number;
}

const BODY = 0x1f232a;
const BODY_HI = 0x2a2f38;
const BODY_DARK = 0x161a20;
const OUTLINE = 0x0a0c10;
const SKIN = 0xe6d6c6;
const HELMET = 0x14171d;
const CAPE_DARK = 0x10141a;
const CAPE_LIGHT = 0x1e232b;
const BOOT = 0x0a0d11;

export const SPEAR_LEN = 172; // ≈ 身高的 2.2 倍
export const SPEAR_LEAN = 0.17; // 基础前倾 ~10°

export const SPEARMAN_FINAL: SpearmanConfig = {
  bodyW: 18,
  bodyH: 48,
  headR: 16,
  helmet: 'hood',
  cape: 'draped',
  accent: 0x3fe0c0,
  fullHood: true,
  spearLen: SPEAR_LEN,
};

/** 颜色插值（闪白用） */
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    ((Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)) >>>
    0
  );
}

export function drawSpearman(g: Phaser.GameObjects.Graphics, c: SpearmanConfig, anim: SpearmanAnim = {}) {
  g.clear();
  const flash = Math.min(1, Math.max(0, anim.flash ?? 0));
  const bodyCol = mix(BODY, 0x9aa3b0, flash);
  const bodyHiCol = mix(BODY_HI, 0xb8c0cc, flash);
  const bodyDarkCol = mix(BODY_DARK, 0x7a828e, flash);
  const skinCol = mix(SKIN, 0xffffff, flash);
  const capeDarkCol = mix(CAPE_DARK, 0x8a93a0, flash);
  const capeLightCol = mix(CAPE_LIGHT, 0xacb5c0, flash);
  const accentCol = mix(c.accent, 0xffffff, flash);

  // 地面阴影（不参与旋转/镜像）
  g.fillStyle(0x000000, 0.16);
  g.fillEllipse(2, -3, 44, 9);

  g.save();
  g.translateCanvas(anim.xShift ?? 0, anim.bob ?? 0);
  g.scaleCanvas(anim.flip ?? 1, 1);
  g.rotateCanvas(anim.rot ?? 0);

  const bx = 0;
  const by = -30;

  // ---- 腿：站立一条腿；行走/战斗姿态两条腿一前一后（远侧深色、相位相反）----
  const swing = anim.legSwing ?? 0;
  if (Math.abs(swing) > 0.12) {
    // 后腿（远侧）：相位相反，更深、略靠后
    const bs = -swing * 0.85;
    const bl = Math.max(0, -swing) * 0.7;
    const bfx = -1.5 + bs * 9;
    const bfy = -2 - bl * 3;
    g.lineStyle(9, 0x0d1014, 1);
    g.beginPath();
    g.moveTo(-1.5, -16);
    g.lineTo(bfx, bfy);
    g.strokePath();
    g.fillStyle(0x07090c, 1);
    g.fillRoundedRect(bfx - 5, bfy - 4, 13, 5, 2.5);
    // 前腿（近侧）
    const fl = Math.max(0, swing) * 0.7;
    const ffx = 1.5 + swing * 9;
    const ffy = -2 - fl * 3;
    g.lineStyle(11, bodyDarkCol, 1);
    g.beginPath();
    g.moveTo(1.5, -16);
    g.lineTo(ffx, ffy);
    g.strokePath();
    g.fillStyle(BOOT, 1);
    g.fillRoundedRect(ffx - 5, ffy - 4, 14, 6, 2.5);
  } else {
    // 站立：一条腿
    g.lineStyle(11, bodyDarkCol, 1);
    g.beginPath();
    g.moveTo(0, -16);
    g.lineTo(0, -2);
    g.strokePath();
    g.fillStyle(BOOT, 1);
    g.fillRoundedRect(-5, -6, 14, 6, 2.5);
  }

  // ---- 躯干（侧面，修长）----
  g.fillStyle(bodyCol, 1);
  g.fillEllipse(bx, by, c.bodyW, c.bodyH);
  g.lineStyle(2.5, OUTLINE, 1);
  g.strokeEllipse(bx, by, c.bodyW, c.bodyH);
  // 前胸 / 前腹凸起
  g.fillStyle(bodyCol, 1);
  g.fillCircle(bx + c.bodyW * 0.36, by - 4, c.bodyW * 0.22);
  g.fillCircle(bx + c.bodyW * 0.34, by + c.bodyH * 0.12, c.bodyW * 0.26);
  // 前侧高光
  g.fillStyle(bodyHiCol, 1);
  g.fillEllipse(bx + c.bodyW * 0.26, by - 4, c.bodyW * 0.2, c.bodyH * 0.5);
  // 腰带
  g.fillStyle(0x10131a, 1);
  g.fillRect(bx - c.bodyW / 2, by + c.bodyH * 0.16, c.bodyW, 5);

  // ---- 披风 ----
  if (c.cape === 'draped') {
    // 上窄下宽梯形披风；下摆随 capeSway 轻摆
    const sway = anim.capeSway ?? 0;
    const topBack = { x: bx - c.bodyW * 0.85, y: by - c.bodyH * 0.4 };
    const topFront = { x: bx + c.bodyW * 0.12, y: by - c.bodyH * 0.38 };
    const botFront = { x: bx + c.bodyW * 0.1 + sway * 0.3, y: by + c.bodyH * 0.42 };
    const botBack = { x: bx - c.bodyW * 1.55 + sway, y: by + c.bodyH * 0.52 };
    g.fillStyle(capeDarkCol, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(topBack.x, topBack.y),
        new Phaser.Math.Vector2(topFront.x, topFront.y),
        new Phaser.Math.Vector2(botFront.x, botFront.y),
        new Phaser.Math.Vector2(botBack.x, botBack.y),
      ],
      true
    );
    g.lineStyle(2, capeLightCol, 1);
    g.beginPath();
    g.moveTo(topFront.x, topFront.y);
    g.lineTo(botFront.x, botFront.y);
    g.strokePath();
    g.lineStyle(2, 0x0a0d11, 1);
    g.beginPath();
    g.moveTo(topBack.x, topBack.y);
    g.lineTo(topFront.x, topFront.y);
    g.strokePath();
  } else {
    drawCape(g, c, bx, by, capeDarkCol, capeLightCol);
  }

  // ---- 前护肩 ----
  g.fillStyle(bodyCol, 1);
  g.fillCircle(bx + c.bodyW * 0.46, by - c.bodyH * 0.36, 6.5);
  g.lineStyle(2, OUTLINE, 1);
  g.strokeCircle(bx + c.bodyW * 0.46, by - c.bodyH * 0.36, 6.5);

  // ---- 大头（侧脸）----
  const hy = by - c.bodyH * 0.5 - c.headR * 0.55;
  g.fillStyle(skinCol, 1);
  g.fillCircle(bx, hy, c.headR);
  g.lineStyle(2.5, OUTLINE, 1);
  g.strokeCircle(bx, hy, c.headR);

  drawHelmet(g, c, bx, hy, skinCol);

  // 侧脸鼻尖
  if (c.helmet !== 'visor' && !(c.helmet === 'hood' && c.fullHood)) {
    g.fillStyle(skinCol, 1);
    g.fillTriangle(
      bx + c.headR * 0.78, hy + c.headR * 0.1,
      bx + c.headR * 1.22, hy + c.headR * 0.26,
      bx + c.headR * 0.78, hy + c.headR * 0.42
    );
  }

  // 神秘单眼（发光强度随 eyeGlow）
  const glow = anim.eyeGlow ?? 1;
  const eyeR = 2.2 * (0.7 + 0.3 * Math.max(0, glow));
  if (c.helmet === 'visor') {
    g.fillStyle(accentCol, 1);
    g.fillRect(bx + c.headR * 0.2, hy + c.headR * 0.06, c.headR * 0.95, 2.6);
  } else {
    g.fillStyle(accentCol, 1);
    g.fillCircle(bx + c.headR * 0.52, hy + c.headR * 0.16, eyeR);
    if (glow > 0.2) {
      g.fillStyle(0xffffff, Math.min(0.95, glow));
      g.fillCircle(bx + c.headR * 0.52, hy + c.headR * 0.16, eyeR * 0.42);
    }
  }

  // ---- 手臂（右手）→ 手在身前握枪 ----
  const hand = { x: 9, y: -28 };
  g.lineStyle(6, bodyCol, 1);
  g.beginPath();
  g.moveTo(bx + c.bodyW * 0.4, by - c.bodyH * 0.3);
  g.lineTo(hand.x, hand.y);
  g.strokePath();

  // ---- 长枪 ----
  drawSpear(g, c, hand, anim.spearLean ?? SPEAR_LEAN, anim.spearExtend ?? 0, anim.grip ?? 30);

  // 手
  g.fillStyle(skinCol, 1);
  g.fillCircle(hand.x, hand.y, 3.6);
  g.lineStyle(1.5, OUTLINE, 1);
  g.strokeCircle(hand.x, hand.y, 3.6);

  g.restore();
}

/**
 * 长枪：枪尾近地、近垂直、微微前倾；lean 越大越前倾（放平=战斗姿态）。
 * grip = 手到枪尾的距离：回缩时 grip 变大（枪尾后探、枪尖回收），刺出时 grip 变小（枪向前滑出）。
 */
function drawSpear(
  g: Phaser.GameObjects.Graphics,
  c: SpearmanConfig,
  hand: { x: number; y: number },
  lean: number,
  extend: number,
  grip: number
) {
  const len = (c.spearLen ?? SPEAR_LEN) + extend;
  const dxn = Math.sin(lean);
  const dyn = -Math.cos(lean);
  const B = { x: hand.x - grip * dxn, y: hand.y - grip * dyn };
  const T = { x: hand.x + (len - grip) * dxn, y: hand.y + (len - grip) * dyn };

  g.lineStyle(2.2, 0x14171c, 1); // 枪杆：黑色
  g.beginPath();
  g.moveTo(B.x, B.y);
  g.lineTo(T.x, T.y);
  g.strokePath();

  // 细长菱形枪头（长 24，半宽 3.2），先画暗色描边层再叠银色
  const L = 24;
  const W = 3.2;
  const pxn = -dyn;
  const pyn = dxn;
  const tip = { x: T.x + L * dxn, y: T.y + L * dyn };
  const s1 = { x: T.x + L * 0.45 * dxn + W * pxn, y: T.y + L * 0.45 * dyn + W * pyn };
  const s2 = { x: T.x + L * 0.45 * dxn - W * pxn, y: T.y + L * 0.45 * dyn - W * pyn };
  // 描边层（稍大一圈）
  g.fillStyle(0x0a0d11, 1);
  g.fillTriangle(tip.x + 1.1 * dxn, tip.y + 1.1 * dyn, s1.x + 1.1 * pxn, s1.y + 1.1 * pyn, s2.x - 1.1 * pxn, s2.y - 1.1 * pyn);
  g.fillTriangle(T.x + 0.6 * dxn, T.y + 0.6 * dyn, s1.x + 1.1 * pxn, s1.y + 1.1 * pyn, s2.x - 1.1 * pxn, s2.y - 1.1 * pyn);
  // 银色枪头
  g.fillStyle(0xd0d6de, 1);
  g.fillTriangle(tip.x, tip.y, s1.x, s1.y, s2.x, s2.y);
  g.fillTriangle(T.x, T.y, s1.x, s1.y, s2.x, s2.y);
}

function drawCape(g: Phaser.GameObjects.Graphics, c: SpearmanConfig, bx: number, by: number, capeDarkCol: number, capeLightCol: number) {
  const sx = bx - c.bodyW * 0.5;
  const sy = by - c.bodyH * 0.34;
  const short = c.cape === 'short';
  const tailX = sx - (short ? 28 : 48);
  const tailY = sy + 30;
  g.fillStyle(capeDarkCol, 1);
  g.fillTriangle(sx, sy, sx - 9, sy + 9, tailX, tailY);
  g.fillStyle(capeLightCol, 1);
  g.fillTriangle(sx - 9, sy + 9, sx - 17, sy + 15, tailX - 8, tailY + 5);
  if (c.cape === 'ragged') {
    g.fillStyle(0x0d1015, 1);
    g.fillTriangle(sx - 6, sy + 14, sx - 14, sy + 22, tailX + 10, tailY + 12);
  }
}

function drawHelmet(g: Phaser.GameObjects.Graphics, c: SpearmanConfig, bx: number, hy: number, skinCol: number) {
  const hr = c.headR;

  // 兜帽没有圆顶——头本身保持圆形
  if (c.helmet !== 'hood') {
    const domeY = hy - hr * 0.32;
    const domeR = hr * 1.02;
    g.fillStyle(HELMET, 1);
    g.fillCircle(bx, domeY, domeR);
  }

  if (c.helmet === 'visor') {
    g.fillStyle(HELMET, 1);
    g.fillEllipse(bx + hr * 0.12, hy, hr * 1.5, hr * 1.7);
    g.fillStyle(0x0c0f14, 1);
    g.fillRect(bx + hr * 0.45, hy - hr * 0.55, 4, hr * 1.05);
  } else if (c.helmet === 'hood') {
    if (c.fullHood) {
      // 全遮面：整张脸盖住，头部保持圆形，只留发光眼
      g.fillStyle(HELMET, 1);
      g.fillCircle(bx, hy, hr - 0.6);
      g.lineStyle(2, OUTLINE, 1);
      g.strokeCircle(bx, hy, hr);
    } else {
      g.fillStyle(HELMET, 1);
      g.fillTriangle(bx - hr * 1.15, hy - hr * 0.25, bx + hr * 0.5, hy - hr * 1.55, bx + hr * 1.25, hy - hr * 0.05);
      g.fillStyle(0x10131a, 0.45);
      g.fillEllipse(bx - hr * 0.08, hy - hr * 0.18, hr * 1.75, hr * 1.55);
    }
  } else {
    g.fillStyle(skinCol, 1);
    g.fillCircle(bx, hy + 0.5, hr - 0.6);
    g.fillStyle(0x0c0f14, 1);
    g.fillRect(bx - hr * 0.72, hy - hr * 0.74, hr * 1.44, 3);
  }

  const topY = hy - hr * 1.34;
  switch (c.helmet) {
    case 'crest': {
      g.fillStyle(0x0c0f14, 1);
      g.fillTriangle(bx - 2, topY + 2, bx - hr * 1.2, topY - hr * 0.8, bx + 4, topY + 3);
      break;
    }
    case 'horn': {
      g.fillStyle(0x0c0f14, 1);
      g.fillTriangle(bx - 4, topY + 1, bx - hr * 1.4, topY - hr * 0.95, bx + 3, topY + 3);
      break;
    }
    case 'plume': {
      g.fillStyle(c.accent, 1);
      g.fillTriangle(bx, topY - 2, bx - 6, topY - hr * 1.1, bx + 8, topY - hr * 1.1);
      g.fillTriangle(bx, topY - 2, bx - 2, topY - hr * 1.45, bx + 4, topY - hr * 1.2);
      break;
    }
    default:
      break;
  }
}

// ---------------- 史莱姆靶子 ----------------

export interface SlimeAnim {
  squash?: number; // 纵向挤压（受击/死亡）
  stretch?: number; // 横向拉伸
  flash?: number; // 受击闪白（秒）
  alpha?: number;
}

export function drawSlime(g: Phaser.GameObjects.Graphics, anim: SlimeAnim = {}) {
  g.clear();
  g.setAlpha(anim.alpha ?? 1);
  const squash = anim.squash ?? 1;
  const stretch = anim.stretch ?? 1;
  const flash = Math.min(1, Math.max(0, anim.flash ?? 0) * 5); // 0.2s 内闪白
  const bodyCol = mix(0xe8555a, 0xffffff, flash);

  g.fillStyle(bodyCol, 1);
  // 中心随挤压下沉，让底部始终贴地
  g.fillEllipse(0, -14 * squash, 34 * stretch, 26 * squash);
  // 暗红轮廓
  g.lineStyle(2, 0x6e1a20, 1);
  g.strokeEllipse(0, -14 * squash, 34 * stretch, 26 * squash);

  if (flash < 0.5) {
    g.fillStyle(0xff9aa0, 1);
    g.fillEllipse(-8 * stretch, -20 * squash, 10 * stretch, 6 * squash);
  }
  g.fillStyle(0x222222, 1);
  g.fillCircle(-6 * stretch, -16 * squash, 2.2);
  g.fillCircle(6 * stretch, -16 * squash, 2.2);
  g.lineStyle(2, 0x222222, 1);
  g.beginPath();
  g.moveTo(-6 * stretch, -8 * squash);
  g.lineTo(-2 * stretch, -6 * squash);
  g.lineTo(2 * stretch, -8 * squash);
  g.strokePath();
}
