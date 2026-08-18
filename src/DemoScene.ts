import * as Phaser from 'phaser';
import { drawSpearman, drawSlime, SPEARMAN_FINAL, SPEAR_LEAN, SPEAR_LEN } from './art/spearman';

/**
 * Phaser 4 玩法 Demo：长枪兵完整动画
 * - 待机 idle：呼吸起伏
 * - 行走 walk：弹跳 + 身体摇摆 + 单腿摆动抬腿 + 披风摆动
 * - 战斗 attack（算法）：放平枪 → 反复"回缩→刺出"，直到脱离战斗才缓慢收枪复位
 * - 受击 hurt：闪白 + 击退
 * - 死亡 die：闪白后仰 → 倒下 → 着地微弹 → 尘土 → 消散
 *
 * 操作：左键选中 ｜ 右键移动 ｜ A 攻击 ｜ K 处决选中单位（预览死亡动画）
 */

const HURT_TOTAL = 0.28;
const DIE_RECOIL = 0.15;
const DIE_FALL_END = 0.7;
const DIE_LAND_END = 0.85;
const DIE_TOTAL = 1.3;

// ---- 战斗姿态算法参数 ----
const LEVEL_TIME = 0.28; // 放平枪耗时
const STAB_CYCLE = 0.42; // 一个"回缩→刺出"周期
const STAB_RETRACT_END = 0.18; // 周期内回缩结束时刻
const STAB_HIT_AT = 0.28; // 周期内伤害结算时刻（此刻握枪位 grip=26，枪尖长 146px）
const STAB_STAB_END = 0.33; // 周期内刺出结束时刻
const RECOVER_TIME = 0.65; // 脱离战斗后缓慢收枪复位
const COMBAT_LEAN = 1.45; // 兜底前倾角（无目标时的战斗姿态）
const GRIP_REST = 30; // 待机握枪位（手到枪尾距离）
const GRIP_RETRACT = 50; // 回缩握枪位（枪尾后探、枪尖回收）
const GRIP_STAB = 14; // 刺出握枪位（枪向前滑出）

// ---- 枪尖瞄准算法（核心）----
// 突刺中段 grip=26 → 枪尖到手的长度 146px；目标站在"手→目标中心 = 146-8"处，
// 刺出瞬间枪尖恰好落进目标中心 8px；前倾角每帧按"手→目标中心"方向实时计算（瞄准）。
const TIP_LEN_AT_HIT = SPEAR_LEN - 26; // 146
const PENETRATION = 8; // 枪尖刺入目标深度
const AIM_BAND = 6; // 距离容差带（±6px）
const AIM_LEAN_MIN = 0.2; // 前倾角钳制（≈11°）
const AIM_LEAN_MAX = 1.7; // 前倾角钳制（≈97°，目标矮时可略向下压枪）

interface Vec {
  x: number;
  y: number;
}

type AnimMode = 'idle' | 'walk' | 'hurt' | 'die';
type CombatPhase = 'none' | 'level' | 'stab' | 'recover';

interface Unit {
  kind: 'spearman' | 'slime';
  gfx: Phaser.GameObjects.Graphics;
  hpBar: Phaser.GameObjects.Graphics;
  pos: Vec;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  state: 'idle' | 'moving' | 'attacking';
  moveTarget: Vec | null;
  target: Unit | null;
  walkPhase: number;
  facingRight: boolean;
  alive: boolean;
  flash: number;
  anim: {
    mode: AnimMode;
    t: number;
    poofed: boolean;
  };
  combat: {
    phase: CombatPhase;
    t: number;
    hitThisCycle: boolean;
    lastLean: number; // 记录当前战斗姿态值，供收枪复位插值
    lastX: number;
    lastRot: number;
  };
  done: boolean;
}

export class DemoScene extends Phaser.Scene {
  private units: Unit[] = [];
  private selected: Unit | null = null;

  constructor() {
    super('demo');
  }

  create() {
    console.log('[Demo] Phaser version =', Phaser.VERSION);

    const grid = this.add.graphics().setDepth(-1);
    grid.lineStyle(1, 0xffffff, 0.07);
    for (let x = 0; x <= 1280; x += 64) {
      grid.beginPath();
      grid.moveTo(x, 0);
      grid.lineTo(x, 720);
      grid.strokePath();
    }
    for (let y = 0; y <= 720; y += 64) {
      grid.beginPath();
      grid.moveTo(0, y);
      grid.lineTo(1280, y);
      grid.strokePath();
    }

    this.drawBanner();

    const spearman = this.spawnUnit('spearman', { x: 300, y: 520 });
    this.spawnUnit('slime', { x: 940, y: 280 });
    this.spawnUnit('slime', { x: 1040, y: 480 });
    this.spawnUnit('slime', { x: 860, y: 620 });

    // 左键选中 / 右键移动
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.selected = this.pickUnit(pointer.x, pointer.y);
      } else if (pointer.button === 2 && this.selected) {
        const u = this.selected;
        u.state = 'moving';
        u.moveTarget = { x: pointer.x, y: pointer.y };
        u.target = null;
        // 打断战斗：缓慢收枪复位
        if (u.combat.phase === 'level' || u.combat.phase === 'stab') {
          u.combat.phase = 'recover';
          u.combat.t = 0;
        }
      }
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'a') {
        const u = this.selected;
        if (!u || !u.alive || u.kind !== 'spearman') return;
        this.orderAttack(u);
      }
      if (k === 'k') {
        const u = this.selected;
        if (u && u.alive && u.anim.mode !== 'die') this.killUnit(u);
      }
    });

    // 自动演示（?auto：自动攻击 + 自动处决）
    if (new URLSearchParams(location.search).has('auto')) {
      this.time.delayedCall(700, () => {
        this.selected = spearman;
        this.orderAttack(spearman);
      });
      this.time.delayedCall(4500, () => {
        const s = this.units.find((u) => u.kind === 'slime' && u.alive);
        if (s) this.killUnit(s);
      });
    }
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    for (const u of this.units) {
      const a = u.anim;
      a.t += dt;

      if (a.mode === 'die') {
        this.updateDeath(u, dt);
        continue;
      }
      if (!u.alive) continue;

      u.walkPhase += dt * (a.mode === 'walk' ? 7 : 1.2);
      if (u.flash > 0) u.flash -= dt;
      if (a.mode === 'hurt' && a.t >= HURT_TOTAL) a.mode = 'idle';

      // 移动 / 追击
      const px = u.pos.x;
      const py = u.pos.y;
      if (u.state === 'moving' && u.moveTarget) {
        const dx = u.moveTarget.x - u.pos.x;
        const dy = u.moveTarget.y - u.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < 4) {
          u.pos.x = u.moveTarget.x;
          u.pos.y = u.moveTarget.y;
          u.state = 'idle';
          u.moveTarget = null;
        } else {
          const step = Math.min(u.speed * dt, d);
          u.pos.x += (dx / d) * step;
          u.pos.y += (dy / d) * step;
          u.facingRight = dx >= 0;
        }
      }
      if (u.state === 'attacking' && u.kind === 'spearman') {
        this.updateAttack(u, dt);
      }
      const isMoving = u.pos.x !== px || u.pos.y !== py;

      // 战斗姿态状态机
      if (u.kind === 'spearman') {
        const cb = u.combat;
        // 脱离战斗（被右键打断/目标全灭）→ 收枪复位
        if (u.state !== 'attacking' && (cb.phase === 'level' || cb.phase === 'stab')) {
          cb.phase = 'recover';
          cb.t = 0;
        }
        if (cb.phase === 'recover') {
          cb.t += dt;
          if (cb.t >= RECOVER_TIME) cb.phase = 'none';
        }
      }

      if (a.mode !== 'hurt') a.mode = isMoving ? 'walk' : 'idle';

      this.drawUnit(u);
      this.drawHpBar(u);
    }

    this.units = this.units.filter((u) => !u.done);
  }

  // ---------- 生成 / 指令 ----------

  private spawnUnit(kind: Unit['kind'], pos: Vec): Unit {
    const gfx = this.add.graphics().setDepth(10);
    const hpBar = this.add.graphics().setDepth(12);
    const u: Unit = {
      kind,
      gfx,
      hpBar,
      pos: { ...pos },
      hp: kind === 'spearman' ? 100 : 40,
      maxHp: kind === 'spearman' ? 100 : 40,
      speed: kind === 'spearman' ? 230 : 0,
      damage: 12,
      state: 'idle',
      moveTarget: null,
      target: null,
      walkPhase: 0,
      facingRight: true,
      alive: true,
      flash: 0,
      anim: { mode: 'idle', t: 0, poofed: false },
      combat: { phase: 'none', t: 0, hitThisCycle: false, lastLean: SPEAR_LEAN, lastX: 0, lastRot: 0 },
      done: false,
    };
    this.units.push(u);
    return u;
  }

  private orderAttack(u: Unit) {
    u.state = 'attacking';
    u.target = this.nearestEnemy(u);
    if (u.combat.phase === 'none' || u.combat.phase === 'recover') {
      u.combat.phase = 'level';
      u.combat.t = 0;
      u.combat.hitThisCycle = false;
    }
  }

  /**
   * 战斗算法：
   * 1) 放平枪（level）：进入战斗先把长枪压到接近水平（冲锋路上也在放平）
   * 2) 保持枪尖距离：太远前进、太近后退、合适才刺
   * 3) 突刺循环（stab）：反复"回缩→刺出"，伤害在刺出中段（枪尖命中目标）结算
   */
  private updateAttack(u: Unit, dt: number) {
    const cb = u.combat;

    if (!u.target || !u.target.alive) {
      u.target = this.nearestEnemy(u);
      if (!u.target) {
        u.state = 'idle';
        if (cb.phase !== 'none') {
          cb.phase = 'recover';
          cb.t = 0;
        }
        return;
      }
    }

    const t = u.target;

    // 进入战斗先放平枪
    if (cb.phase === 'none') {
      cb.phase = 'level';
      cb.t = 0;
    }
    if (cb.phase === 'level') {
      cb.t += dt;
      // 放平过程中也在移动调整距离
      this.keepRange(u, t, dt);
      if (cb.t >= LEVEL_TIME) {
        cb.phase = 'stab';
        cb.t = 0;
        cb.hitThisCycle = false;
      }
      return;
    }

    // 突刺循环
    if (cb.phase === 'stab') {
      const range = this.keepRange(u, t, dt);
      if (range !== 'in-range') return; // 前进/后退中，不刺
      cb.t += dt;
      const cyc = cb.t % STAB_CYCLE;
      if (cyc < STAB_RETRACT_END) cb.hitThisCycle = false;
      else if (cyc >= STAB_HIT_AT && !cb.hitThisCycle) {
        cb.hitThisCycle = true;
        this.applyHit(u);
      }
    }
  }

  /**
   * 保持枪尖交战距离（核心算法）：
   * 以"手→目标中心"的距离为基准，目标 = 枪尖刺出长度 − 刺入深度。
   * 太远 → 前进；太近（枪尖会戳过头）→ 后退；合适 → 'in-range' 发动刺击。
   * 后退时仍然面向目标（倒着走，速度减慢）。
   */
  private keepRange(u: Unit, t: Unit, dt: number): 'advance' | 'retreat' | 'in-range' {
    u.facingRight = t.pos.x >= u.pos.x;
    const aim = { x: t.pos.x, y: t.pos.y - this.targetCenterOffset(t) };
    const handX = u.pos.x + 9 * (u.facingRight ? 1 : -1);
    const handY = u.pos.y - 28;
    const d = Math.hypot(aim.x - handX, aim.y - handY);
    const ideal = TIP_LEN_AT_HIT - PENETRATION;

    const tx = t.pos.x - u.pos.x;
    const ty = t.pos.y - u.pos.y;
    const td = Math.hypot(tx, ty) || 1;

    if (d > ideal + AIM_BAND) {
      const step = Math.min(u.speed * dt, d - ideal + AIM_BAND);
      u.pos.x += (tx / td) * step;
      u.pos.y += (ty / td) * step;
      return 'advance';
    }
    if (d < ideal - AIM_BAND) {
      const step = Math.min(u.speed * 0.7 * dt, ideal - d + AIM_BAND);
      u.pos.x -= (tx / td) * step;
      u.pos.y -= (ty / td) * step;
      return 'retreat';
    }
    return 'in-range';
  }

  /** 目标中心在脚上方的距离（史莱姆矮、长枪兵高） */
  private targetCenterOffset(t: Unit): number {
    return t.kind === 'slime' ? 14 : 30;
  }

  /** 枪尖瞄准算法：由"手→目标中心"方向实时求长枪前倾角（弧度），保证枪尖指向目标中心 */
  private spearAimLean(u: Unit, t: Unit): number {
    const aimY = t.pos.y - this.targetCenterOffset(t);
    const handX = u.pos.x + 9 * (u.facingRight ? 1 : -1);
    const handY = u.pos.y - 28;
    const dx = t.pos.x - handX;
    const dy = aimY - handY;
    const d = Math.hypot(dx, dy) || 1;
    // 枪尖方向 = (sin lean, -cos lean)；瞄准 = (dx/d, dy/d) → lean = atan2(dx/d, -dy/d)
    const lean = Math.atan2(dx / d, -dy / d);
    return Phaser.Math.Clamp(lean, AIM_LEAN_MIN, AIM_LEAN_MAX);
  }

  private applyHit(u: Unit) {
    const t = u.target;
    if (!t || !t.alive) return;
    t.hp -= u.damage;
    t.flash = 0.18;
    if (t.anim.mode !== 'die') {
      t.anim.mode = 'hurt';
      t.anim.t = 0;
    }
    this.spawnDamageText(t.pos.x, t.pos.y - (t.kind === 'slime' ? 34 : 60), `-${u.damage}`);
    if (t.hp <= 0) this.killUnit(t);
  }

  private killUnit(u: Unit) {
    u.alive = false;
    u.anim.mode = 'die';
    u.anim.t = 0;
    u.anim.poofed = false;
    if (this.selected === u) this.selected = null;
  }

  private updateDeath(u: Unit, dt: number) {
    const a = u.anim;
    if (a.t >= DIE_TOTAL) {
      u.done = true;
      u.gfx.destroy();
      u.hpBar.destroy();
      return;
    }

    if (u.kind === 'slime') {
      const t = a.t;
      let squash = 1;
      let alpha = 1;
      if (t < 0.35) squash = 1 - 0.75 * (t / 0.35);
      else if (t < 0.7) {
        squash = 0.25;
        alpha = 1 - (t - 0.35) / 0.35;
      } else {
        squash = 0.25;
        alpha = 0;
      }
      drawSlime(u.gfx, { squash, stretch: 1.25, flash: 0.8, alpha });
      u.gfx.setPosition(u.pos.x, u.pos.y);
      u.hpBar.setAlpha(alpha);
      return;
    }

    const t = a.t;
    let rot = 0;
    let alpha = 1;
    let xShift = 0;
    if (t < DIE_RECOIL) {
      const k = t / DIE_RECOIL;
      rot = -0.09 * k;
    } else if (t < DIE_FALL_END) {
      const k = (t - DIE_RECOIL) / (DIE_FALL_END - DIE_RECOIL);
      rot = -0.09 - 1.19 * k;
      xShift = -2 * k;
    } else if (t < DIE_LAND_END) {
      const k = (t - DIE_FALL_END) / (DIE_LAND_END - DIE_FALL_END);
      rot = -1.28 + Math.sin(k * Math.PI) * 0.05;
      if (!a.poofed) {
        a.poofed = true;
        this.spawnPoof(u.pos.x, u.pos.y - 4);
      }
    } else {
      rot = -1.28;
      alpha = Math.max(0, 1 - (t - DIE_LAND_END) / 0.45);
    }
    drawSpearman(u.gfx, SPEARMAN_FINAL, {
      flip: u.facingRight ? 1 : -1,
      rot,
      xShift,
      eyeGlow: 0.4,
    });
    u.gfx.setPosition(u.pos.x, u.pos.y);
    u.gfx.setAlpha(alpha);
    u.hpBar.setAlpha(alpha);
  }

  // ---------- 绘制 ----------

  private drawUnit(u: Unit) {
    const a = u.anim;
    const now = this.time.now / 1000;

    if (u.kind === 'slime') {
      const breathe = Math.sin(now * 3 + u.pos.x * 0.1);
      let squash = 1 - 0.06 * breathe;
      let stretch = 1 + 0.06 * breathe;
      if (a.mode === 'hurt') {
        squash = 0.72;
        stretch = 1.25;
      }
      drawSlime(u.gfx, { squash, stretch, flash: u.flash });
      u.gfx.setPosition(u.pos.x, u.pos.y);
      return;
    }

    // ---- 基础动作（walk / idle / hurt）----
    let bob = 0;
    let rot = 0;
    let legSwing = 0;
    let legLift = 0;
    let capeSway = 0;
    let eyeGlow = 1;
    switch (a.mode) {
      case 'walk': {
        const p = u.walkPhase;
        bob = -Math.abs(Math.sin(p)) * 3.5;
        rot = Math.sin(p) * 0.05;
        legSwing = Math.sin(p);
        legLift = Math.max(0, Math.sin(p));
        capeSway = Math.sin(p) * 2.5;
        break;
      }
      case 'hurt': {
        const k = Math.max(0, 1 - a.t / HURT_TOTAL);
        rot = -0.09 * k;
        eyeGlow = 1.4;
        break;
      }
      default: {
        bob = Math.sin(now * 2.2) * 0.9;
        rot = Math.sin(now * 1.6) * 0.015;
        eyeGlow = 1 + 0.15 * Math.sin(now * 3); // 眼睛呼吸光晕
        break;
      }
    }

    // ---- 战斗姿态覆盖 ----
    const cb = u.combat;
    let spearLean = SPEAR_LEAN;
    let xShift = 0;
    let grip = GRIP_REST;
    if (cb.phase === 'level' || cb.phase === 'stab') {
      bob = 0; // 战斗时身体稳住，只有武器和姿态在动
    }
    if (cb.phase === 'level') {
      const k = easeOut(Math.min(1, cb.t / LEVEL_TIME));
      const aim = u.target ? this.spearAimLean(u, u.target) : COMBAT_LEAN;
      cb.lastLean = SPEAR_LEAN + (aim - SPEAR_LEAN) * k;
      cb.lastRot = 0.04 * k;
      cb.lastX = 0;
      spearLean = cb.lastLean;
      rot += cb.lastRot;
      eyeGlow = Math.max(eyeGlow, 1.3);
      if (a.mode !== 'walk') {
        // 静止放平：摆开战斗架势（移动中保持行走摆腿）
        legSwing = 0.35;
        legLift = 0.2;
      }
    } else if (cb.phase === 'stab') {
      // 每帧瞄准：枪尖实时指向目标中心
      cb.lastLean = u.target ? this.spearAimLean(u, u.target) : COMBAT_LEAN;
      cb.lastRot = 0.05;
      spearLean = cb.lastLean;
      rot += 0.05;
      eyeGlow = Math.max(eyeGlow, 1.6);
      if (a.mode !== 'walk') {
        legSwing = 0.35;
        legLift = 0.25;
      }
      // 回缩 → 刺出（枪在手里滑动）
      const cyc = cb.t % STAB_CYCLE;
      if (cyc < STAB_RETRACT_END) {
        const k = cyc / STAB_RETRACT_END;
        grip = GRIP_REST + (GRIP_RETRACT - GRIP_REST) * k;
        cb.lastX = -3 * k;
      } else if (cyc < STAB_STAB_END) {
        const k = (cyc - STAB_RETRACT_END) / (STAB_STAB_END - STAB_RETRACT_END);
        grip = GRIP_RETRACT + (GRIP_STAB - GRIP_RETRACT) * k;
        cb.lastX = -3 + 12 * k;
        eyeGlow = 2;
      } else {
        grip = GRIP_STAB;
        cb.lastX = 9;
      }
      xShift += cb.lastX;
    } else if (cb.phase === 'recover') {
      const k = easeInOut(Math.min(1, cb.t / RECOVER_TIME));
      spearLean = cb.lastLean + (SPEAR_LEAN - cb.lastLean) * k;
      rot += cb.lastRot * (1 - k);
      xShift += cb.lastX * (1 - k);
      cb.lastLean = spearLean;
      cb.lastRot = cb.lastRot * (1 - k);
      cb.lastX = cb.lastX * (1 - k);
    }

    drawSpearman(u.gfx, SPEARMAN_FINAL, {
      flip: u.facingRight ? 1 : -1,
      bob,
      rot,
      xShift,
      legSwing,
      legLift,
      spearLean,
      grip,
      capeSway,
      eyeGlow,
      flash: 0,
    });
    u.gfx.setPosition(u.pos.x, u.pos.y);
    u.gfx.setAlpha(1);
  }

  private drawHpBar(u: Unit) {
    const g = u.hpBar;
    g.clear();
    const w = 40;
    const h = 6;
    const x = u.pos.x - w / 2;
    const y = u.pos.y - (u.kind === 'spearman' ? 92 : 56);
    // 底 + 边框
    g.fillStyle(0x000000, 0.62);
    g.fillRoundedRect(x - 1.5, y - 1.5, w + 3, h + 3, 2.5);
    g.lineStyle(1.5, 0xffffff, 0.35);
    g.strokeRoundedRect(x - 1.5, y - 1.5, w + 3, h + 3, 2.5);
    // 血量
    const pct = Phaser.Math.Clamp(u.hp / u.maxHp, 0, 1);
    g.fillStyle(u.kind === 'spearman' ? 0x66cc66 : 0xe8555a, 1);
    g.fillRoundedRect(x, y, Math.max(0.01, w * pct), h, 1.5);
    // 默认不显示，选中才显示（死亡时透明度由 updateDeath 接管）
    g.setAlpha(u === this.selected ? 1 : 0);
  }

  // ---------- 拾取 ----------

  private pickUnit(x: number, y: number): Unit | null {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (!u.alive || u.anim.mode === 'die') continue;
      const cy = u.pos.y - (u.kind === 'spearman' ? 40 : 16);
      if (Math.hypot(x - u.pos.x, y - cy) <= 34) return u;
    }
    return null;
  }

  private nearestEnemy(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const other of this.units) {
      if (!other.alive || other.anim.mode === 'die' || other.kind === u.kind) continue;
      const d = Math.hypot(other.pos.x - u.pos.x, other.pos.y - u.pos.y);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }

  // ---------- 特效 ----------

  private spawnDamageText(x: number, y: number, str: string) {
    const txt = this.add
      .text(x, y, str, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#ff5252',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: txt,
      y: y - 42,
      alpha: 0,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  private spawnPoof(x: number, y: number) {
    const p = this.add.circle(x, y, 6, 0xffffff, 0.9).setDepth(25);
    this.tweens.add({
      targets: p,
      scale: 3,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy(),
    });
  }

  private drawBanner() {
    const g = this.add.graphics().setDepth(40);
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(16, 14, 620, 40, 10);
    this.add
      .text(36, 34, '左键选中 ｜ 右键移动 ｜ A 攻击（放平枪反复刺）｜ K 处决', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
      })
      .setDepth(41);
  }
}

// ---------- 缓动 ----------

function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k);
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
