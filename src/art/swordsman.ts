import * as Phaser from 'phaser';
import { PALETTE, mix, drawSoldierLegs } from './spearman';

/**
 * 剑士 v3（侧身暗色系）：
 *  - 希腊式全覆盖头盔：头盔就是整个头的形状（头骨圆盔 + 前部颊甲 + T 形眼缝 + 鼻梁条 + 顶饰马鬃）
 *  - 无披风；左手持圆盾（护住胸口；格挡时举起护住头脸）
 *  - 长剑在**远侧**：绘制顺序 = 剑（最底）→ 身体 → 头 → 盾牌（最前）
 *    侧面看过去剑被身体和盾牌遮住，只有超出轮廓的部分（剑尖/举剑）露出来
 *  - 攻击：举剑蓄力 → 至上而下挥砍（handLift 抬手上举 + weaponLean 挥砍弧线）
 *  - 格挡：shieldBlock 0..1 控制盾牌举起护住头脸，身体后仰
 */

export interface SwordsmanConfig {
  bodyW: number;
  bodyH: number;
  headR: number;
  accent: number;
  weaponLen?: number;
}

export interface SwordsmanAnim {
  flip?: 1 | -1;
  bob?: number;
  rot?: number;
  xShift?: number;
  legSwing?: number;
  legLift?: number;
  /** 武器前倾角（弧度，0=竖直，负=剑尖朝后上方蓄力） */
  weaponLean?: number;
  /** 手到剑尾距离（剑基本不滑，保持握柄位） */
  grip?: number;
  /** 抬手上举 0..1（挥砍蓄力时剑举过头） */
  handLift?: number;
  /** 盾牌举起 0..1（格挡时护住头脸） */
  shieldBlock?: number;
  eyeGlow?: number;
  flash?: number;
}

export const SWORDSMAN_FINAL: SwordsmanConfig = {
  bodyW: 19,
  bodyH: 46,
  headR: 15,
  accent: 0xe07a3a,
  weaponLen: 46,
};

export function drawSwordsman(g: Phaser.GameObjects.Graphics, c: SwordsmanConfig, anim: SwordsmanAnim = {}) {
  g.clear();
  const flash = Math.min(1, Math.max(0, anim.flash ?? 0));
  const bodyCol = mix(PALETTE.BODY, 0x9aa3b0, flash);
  const bodyHiCol = mix(PALETTE.BODY_HI, 0xb8c0cc, flash);
  const bodyDarkCol = mix(PALETTE.BODY_DARK, 0x7a828e, flash);
  const skinCol = mix(PALETTE.SKIN, 0xffffff, flash);
  const accentCol = mix(c.accent, 0xffffff, flash);
  const steel = mix(0xc8cfd8, 0xffffff, flash);
  const steelDark = mix(0x8a929c, 0xffffff, flash);
  const helmetHi = mix(0x1a1f28, 0xffffff, flash);

  // 地面阴影（不参与旋转/镜像）
  g.fillStyle(0x000000, 0.16);
  g.fillEllipse(2, -3, 44, 9);

  g.save();
  g.translateCanvas(anim.xShift ?? 0, anim.bob ?? 0);
  g.scaleCanvas(anim.flip ?? 1, 1);
  g.rotateCanvas(anim.rot ?? 0);

  const bx = 0;
  const by = -30;

  // ---- 腿（共享）----
  drawSoldierLegs(g, bodyDarkCol, anim.legSwing ?? 0);

  // ============================================================
  // 第一层：右手（远侧）握剑 —— 画在身体后面，被身体和盾牌遮住
  // ============================================================
  const handLift = Math.min(1, Math.max(0, anim.handLift ?? 0));
  const hand = { x: 10 - 2 * handLift, y: -36 - 12 * handLift };
  // 手臂（从肩后探出）
  g.lineStyle(6, bodyDarkCol, 1);
  g.beginPath();
  g.moveTo(bx + c.bodyW * 0.4, by - c.bodyH * 0.3);
  g.lineTo(hand.x, hand.y);
  g.strokePath();
  // 长剑（打磨：护手 + 柄缠线 + 锥形剑刃 + 剑脊高光）
  drawSword(g, c, hand, anim.weaponLean ?? 0.38, anim.grip ?? 10, steel, steelDark);
  // 握剑的手
  g.fillStyle(skinCol, 1);
  g.fillCircle(hand.x, hand.y, 3.6);
  g.lineStyle(1.5, PALETTE.OUTLINE, 1);
  g.strokeCircle(hand.x, hand.y, 3.6);

  // ---- 躯干（侧身，护甲）----
  g.fillStyle(bodyCol, 1);
  g.fillEllipse(bx, by, c.bodyW, c.bodyH);
  g.lineStyle(2.5, PALETTE.OUTLINE, 1);
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

  // ---- 头部：希腊式全覆盖头盔（头盔 = 整个头的形状）----
  const hy = by - c.bodyH * 0.5 - c.headR * 0.55;
  // 头骨圆盔（整个头的形状）
  g.fillStyle(PALETTE.HELMET, 1);
  g.fillCircle(bx, hy, c.headR);
  // 前部颊甲（略突出，盖住脸）
  g.fillStyle(helmetHi, 1);
  g.fillEllipse(bx + c.headR * 0.24, hy + c.headR * 0.02, c.headR * 0.92, c.headR * 0.85);
  // 头轮廓
  g.lineStyle(2.5, PALETTE.OUTLINE, 1);
  g.strokeCircle(bx, hy, c.headR);
  // T 形眼缝（横向开口）
  g.fillStyle(0x07090c, 1);
  g.fillRect(bx + c.headR * 0.1, hy - c.headR * 0.2, c.headR * 1.15, c.headR * 0.32);
  // 鼻梁条（纵向，把眼缝分成前后两段）
  g.fillStyle(helmetHi, 1);
  g.fillRect(bx + c.headR * 0.78, hy - c.headR * 0.32, c.headR * 0.2, c.headR * 0.85);
  // 发光眼（从眼缝里透出）
  const glow = anim.eyeGlow ?? 1;
  const eyeR = 2.2 * (0.7 + 0.3 * Math.max(0, glow));
  g.fillStyle(accentCol, 1);
  g.fillCircle(bx + c.headR * 0.52, hy - c.headR * 0.05, eyeR);
  if (glow > 0.2) {
    g.fillStyle(0xffffff, Math.min(0.95, glow));
    g.fillCircle(bx + c.headR * 0.52, hy - c.headR * 0.05, eyeR * 0.42);
  }
  // 顶饰马鬃（accent 色双层）
  g.fillStyle(accentCol, 1);
  g.fillTriangle(
    bx - 2, hy - c.headR * 0.85,
    bx - 9, hy - c.headR * 1.95,
    bx + 6, hy - c.headR * 1.8
  );
  g.fillStyle(mix(accentCol, 0xffffff, 0.35), 1);
  g.fillTriangle(
    bx - 2, hy - c.headR * 0.85,
    bx - 1, hy - c.headR * 1.7,
    bx + 6, hy - c.headR * 1.8
  );

  // ============================================================
  // 最前层：左手圆盾（护住胸口；格挡时举起护住头脸）
  // ============================================================
  const sh = Math.min(1, Math.max(0, anim.shieldBlock ?? 0));
  const shield = { x: 8 + 2 * sh, y: -28 - 24 * sh };
  const SR = 12.5;
  // 左臂（盾后）
  g.lineStyle(5, bodyDarkCol, 1);
  g.beginPath();
  g.moveTo(bx + 4, by - 12);
  g.lineTo(shield.x - 3, shield.y - 4);
  g.strokePath();
  // 盾面：深色铁 + accent 描边 + 内环 + 四颗圆钉 + 中央凸起
  g.fillStyle(0x232a33, 1);
  g.fillCircle(shield.x, shield.y, SR);
  g.lineStyle(2.2, accentCol, 1);
  g.strokeCircle(shield.x, shield.y, SR);
  g.lineStyle(2, PALETTE.OUTLINE, 1);
  g.strokeCircle(shield.x, shield.y, SR - 2.2);
  g.fillStyle(0x0c0f14, 1);
  for (let i = 0; i < 4; i++) {
    const ang = (Math.PI * 2 * i) / 4 + Math.PI / 4;
    g.fillCircle(shield.x + Math.cos(ang) * (SR - 3.6), shield.y + Math.sin(ang) * (SR - 3.6), 1.1);
  }
  g.fillStyle(mix(0x39424e, 0xffffff, flash), 1);
  g.fillCircle(shield.x, shield.y, 4.6);
  g.lineStyle(1.5, accentCol, 0.8);
  g.strokeCircle(shield.x, shield.y, 4.6);
  g.fillStyle(0xffffff, Math.min(0.5, 0.3 + 0.3 * sh)); // 格挡举起时高光更亮
  g.fillCircle(shield.x - 1.6, shield.y - 1.8, 1.6);

  g.restore();
}

/**
 * 长剑：护手（两端配重球）→ 剑柄（深色 + 斜缠线）→ 柄尾球 →
 * 剑刃（根宽尖细的锥形填充 + 暗色轮廓 + 剑脊高光线）。
 * grip = 手到柄尾的距离（剑不滑，保持固定握柄位）。
 */
function drawSword(
  g: Phaser.GameObjects.Graphics,
  c: SwordsmanConfig,
  hand: { x: number; y: number },
  lean: number,
  grip: number,
  steel: number,
  steelDark: number
) {
  const len = c.weaponLen ?? 46;
  const dxn = Math.sin(lean);
  const dyn = -Math.cos(lean);
  const B = { x: hand.x - grip * dxn, y: hand.y - grip * dyn }; // 柄尾
  const T = { x: hand.x + (len - grip) * dxn, y: hand.y + (len - grip) * dyn }; // 剑尖
  const pxn = -dyn;
  const pyn = dxn; // 垂直方向

  // 护手（横条 + 两端配重球）
  g.lineStyle(4, 0x8a6a3a, 1);
  g.beginPath();
  g.moveTo(hand.x + 9 * pxn, hand.y + 9 * pyn);
  g.lineTo(hand.x - 9 * pxn, hand.y - 9 * pyn);
  g.strokePath();
  g.fillStyle(0xd8c8a0, 1);
  g.fillCircle(hand.x + 9 * pxn, hand.y + 9 * pyn, 1.8);
  g.fillCircle(hand.x - 9 * pxn, hand.y - 9 * pyn, 1.8);

  // 剑柄（深色底）
  g.lineStyle(4.5, 0x3a2a1c, 1);
  g.beginPath();
  g.moveTo(hand.x, hand.y);
  g.lineTo(B.x, B.y);
  g.strokePath();
  // 柄缠线（斜纹）
  g.lineStyle(1.2, 0x8a6a3a, 1);
  for (let i = 1; i < 4; i++) {
    const k = i / 4;
    const hx = hand.x + (B.x - hand.x) * k;
    const hy = hand.y + (B.y - hand.y) * k;
    g.beginPath();
    g.moveTo(hx - 2.5 * pxn, hy - 2.5 * pyn);
    g.lineTo(hx + 2.5 * pxn, hy + 2.5 * pyn);
    g.strokePath();
  }
  // 柄尾球
  g.fillStyle(0x6a4a2a, 1);
  g.fillCircle(B.x, B.y, 2.6);
  g.fillStyle(0xd8c8a0, 1);
  g.fillCircle(B.x, B.y, 1.2);

  // 剑刃：锥形（根宽 3.4 → 中 2.3 → 剑尖聚拢），暗色轮廓包一圈
  const wBase = 3.4;
  const wMid = 2.3;
  const mx = hand.x + (T.x - hand.x) * 0.55;
  const my = hand.y + (T.y - hand.y) * 0.55;
  g.fillStyle(steelDark, 1);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(hand.x + (wBase + 0.8) * pxn, hand.y + (wBase + 0.8) * pyn),
      new Phaser.Math.Vector2(mx + (wMid + 0.8) * pxn, my + (wMid + 0.8) * pyn),
      new Phaser.Math.Vector2(T.x + 0.7 * pxn, T.y + 0.7 * pyn),
      new Phaser.Math.Vector2(T.x, T.y),
      new Phaser.Math.Vector2(T.x - 0.7 * pxn, T.y - 0.7 * pyn),
      new Phaser.Math.Vector2(mx - (wMid + 0.8) * pxn, my - (wMid + 0.8) * pyn),
      new Phaser.Math.Vector2(hand.x - (wBase + 0.8) * pxn, hand.y - (wBase + 0.8) * pyn),
    ],
    true
  );
  // 亮色剑身
  g.fillStyle(steel, 1);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(hand.x + wBase * pxn, hand.y + wBase * pyn),
      new Phaser.Math.Vector2(mx + wMid * pxn, my + wMid * pyn),
      new Phaser.Math.Vector2(T.x, T.y),
      new Phaser.Math.Vector2(mx - wMid * pxn, my - wMid * pyn),
      new Phaser.Math.Vector2(hand.x - wBase * pxn, hand.y - wBase * pyn),
    ],
    true
  );
  // 剑脊高光线
  g.lineStyle(1.3, mix(steel, 0xffffff, 0.5), 1);
  g.beginPath();
  g.moveTo(hand.x + 1.1 * pxn, hand.y + 1.1 * pyn);
  g.lineTo(mx + 0.7 * pxn, my + 0.7 * pyn);
  g.strokePath();
  // 剑尖高光
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(T.x, T.y, 1.2);
}
