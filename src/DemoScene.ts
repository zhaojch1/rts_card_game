import * as Phaser from 'phaser';
import { drawSpearman, SPEARMAN_FINAL } from './art/spearman';
import { drawSwordsman, SWORDSMAN_FINAL } from './art/swordsman';
import { UNIT_TYPES, UnitKind, UnitStats } from './units';

/**
 * Phaser 4 对战测试场景：长枪兵（A 方，绿）vs 剑士（B 方，红）
 * - 底部卡牌栏：点击「长矛兵 / 剑士」卡牌 → 在卡牌上方生成对应兵种
 * - 点选单位后再点击敌方单位 → 对该目标发起攻击（也可自动索敌参战）
 * - 长枪兵：攻击距离长（枪尖刚碰到敌人就产生伤害）、命中击退、首击 50% 暴击；
 *   被贴脸（敌人进入它自己的攻击范围）→ 后撤步拉开（10s 冷却，只触发一次）→ 收枪站桩挨打
 * - 剑士：移速快、攻击高、血厚，对长枪兵有 1.5 倍伤害加成，30% 概率盾牌格挡
 *   （格挡后长枪兵的长枪被弹开，进入收枪恢复/非战斗状态）
 * - 伪3D 深度排序 + 同队软分离（跨队允许贴脸近战）
 *
 * 操作：点击卡牌召唤 ｜ 左键选中 / 点敌方单位下令攻击 ｜ 右键移动 ｜ V 停止 ｜ A 攻击 ｜ K 处决
 */

const HURT_TOTAL = 0.28;
const DIE_RECOIL = 0.15;
const DIE_FALL_END = 0.7;
const DIE_LAND_END = 0.85;
const DIE_TOTAL = 1.3;

// ---- 战斗姿态算法参数（所有近战兵种通用）----
const LEVEL_TIME = 0.28; // 放平武器耗时
const STAB_CYCLE = 0.42; // 一个"回缩→刺出"周期
const STAB_RETRACT_END = 0.18; // 周期内回缩结束时刻
const STAB_HIT_AT = 0.28; // 周期内伤害结算时刻
const STAB_STAB_END = 0.33; // 周期内刺出结束时刻
const RECOVER_TIME = 0.65; // 脱离战斗后缓慢收武器复位
const COMBAT_LEAN = 1.45; // 兜底前倾角（无目标时的战斗姿态）
const PENETRATION = 8; // 武器尖刺入目标深度
const AIM_BAND = 6; // 距离容差带（±6px）
const AIM_LEAN_MIN = 0.2; // 前倾角钳制（≈11°）
const AIM_LEAN_MAX = 2.0; // 前倾角钳制（≈115°，允许剑士向下挥砍也精确指向目标）

// ---- 长枪兵特性：击退 ----
// 枪尖命中后把敌人顶回去，直到敌人"刚好够到枪尖"：
// 击退量 = 枪尖长度(146) − 当前"手→目标中心"距离，钳制在 [KNOCKBACK_MIN, KNOCKBACK_MAX]
const KNOCKBACK_MIN = 4;
const KNOCKBACK_MAX = 10; // 上限：敌人贴身时不会被一下打飞太远，仍能逼近

// ---- 长枪兵特性：首击暴击 ----
// 摆平枪尖后第一次枪尖接触目标时，有 50% 概率打出暴击（大伤害），否则是普通伤害
const CRIT_MULT = 3;
const CRIT_CHANCE = 0.5;

// ---- 长枪兵特性：后撤步 ----
// 被近身（敌人进入它自己的攻击范围）后发动一次快速后退拉开距离，有冷却时间防止无限后退；
// 后退距离 = 移速 × RETREAT_SPEED_MULT × RETREAT_DURATION ≈ 184px（长枪兵 230 × 4.0 × 0.2）
const RETREAT_SPEED_MULT = 4.0; // 后退速度倍率（快速拉开，从2.5提升到4.0）
const RETREAT_CD = 8.0; // 后撤冷却（秒，从10降到8）
const RETREAT_DURATION = 0.2; // 后撤动画时长（秒）

// ---- 长枪兵特性：贴脸判定余量 ----
// 贴脸判定用"我方手→敌人瞄准点"的距离，而敌人实际交战距离是"敌人自己的手→我方瞄准点"，
// 参照点不同会差出 1~2px：若不加余量，剑士刚好停在阈值外时枪兵会误以为还能接近 → 在 approach
// 里不断倒退（被更快的剑士一路追着打）。加 2px 余量让判定可靠覆盖敌人的实际攻击距离。
const SPEAR_CLOSE_MARGIN = 2; // 贴脸判定余量（px）

// ---- 剑士特性：盾牌格挡 ----
// 被攻击时有 30% 概率用圆盾挡住；格挡后攻击者的长枪被弹开（进入收枪恢复/非战斗状态）
const BLOCK_CHANCE = 0.3;
const BLOCK_TIME = 0.5; // 格挡姿态时长（秒）
const BLOCK_CD = 2.0; // 格挡冷却（秒）：格挡成功后必须等这段时间才能再次格挡，防止多单位连续格挡
const SPEAR_KNOCK_TIME = 0.35; // 长枪被弹开的姿态时长（秒）

// ---- 底部卡牌召唤 ----
const CARD_W = 120;
const CARD_H = 90;
const CARD_Y_OFFSET = 56; // 卡牌中心距底部的距离（增加以容纳更厚的底板）
const SPAWN_Y_OFFSET = 120; // 生成点：卡牌上方
const CARD_CD = 0.8; // 卡牌冷却（秒）
const MAX_UNITS = 24; // 场上单位上限

// ---- 木质卡牌栏常量 ----
const BAR_HEIGHT = 108; // 底板总高度
const BAR_PADDING = 24; // 底板左右边距
const METAL_STRIP_H = 4; // 金属装饰条高度
const RIVET_RADIUS = 4; // 铆钉半径
const LEATHER_INSET = 6; // 皮革凹槽内缩

// ---- 伪3D 软分离（允许叠加，但缓慢隔开避免完全重叠）----
const SEP_MIN = 30; // 期望最小间距（小于此值开始分离）
const SEP_RATE = 2.0; // 分离速率（越小越"缓慢"）

// ---- 剑士对长枪兵的伤害加成 ----
const SWORD_VS_SPEAR_MULT = 1.5;

interface Vec {
  x: number;
  y: number;
}

type AnimMode = 'idle' | 'walk' | 'hurt' | 'die';
type CombatPhase = 'none' | 'approach' | 'level' | 'stab' | 'recover';

interface Unit {
  kind: UnitKind;
  stats: UnitStats;
  gfx: Phaser.GameObjects.Graphics;
  hpBar: Phaser.GameObjects.Graphics;
  pos: Vec;
  hp: number;
  state: 'idle' | 'moving' | 'attacking';
  /** 挂起自动索敌（V 停止攻击后置 true，A 攻击 / 右键移动指令置 false） */
  holdFire: boolean;
  moveTarget: Vec | null;
  target: Unit | null;
  walkPhase: number;
  facingRight: boolean;
  alive: boolean;
  flash: number;
  /** 剑士格挡姿态剩余时间（>0 时盾牌举起护身） */
  blockT: number;
  /** 剑士格挡冷却剩余时间（>0 时无法格挡，防止多单位连续格挡） */
  blockCD: number;
  /** 长枪兵长枪被格挡弹开的姿态剩余时间（>0 时枪被弹向上方） */
  spearKnock: number;
  /** 长枪兵对当前目标的暴击是否已打出（换目标后重置，下一次命中即暴击） */
  critUsed: boolean;
  /** 长枪兵后撤步冷却剩余时间（>0 时无法再次后撤） */
  retreatCD: number;
  /** 长枪兵后撤步动画剩余时间（>0 时正在后退） */
  retreatT: number;
  /** 后撤步锁定方向（1 = 向右退，-1 = 向左退，触发时锁定不再变化） */
  retreatDir: 1 | -1;
  anim: {
    mode: AnimMode;
    t: number;
    poofed: boolean;
  };
  combat: {
    phase: CombatPhase;
    t: number;
    hitThisCycle: boolean;
    lastLean: number; // 记录当前战斗姿态值，供收武器复位插值
    lastX: number;
    lastRot: number;
  };
  done: boolean;
}

interface CardDef {
  kind: UnitKind;
  x: number;
  y: number;
  cooldown: number;
}

export class DemoScene extends Phaser.Scene {
  private units: Unit[] = [];
  private selected: Unit | null = null;
  private selectedUnits: Unit[] = []; // 框选的单位数组
  private cards: CardDef[] = [];
  private cardGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics; // 木质底板（静态，只绘制一次）
  private hoveredCard: CardDef | null = null; // 悬停的卡牌
  
  // 框选相关变量
  private isSelecting: boolean = false;
  private selectStartX: number = 0;
  private selectStartY: number = 0;
  private selectEndX: number = 0;
  private selectEndY: number = 0;
  private selectGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('demo');
  }

  create() {
    console.log('[Demo] Phaser version =', Phaser.VERSION);

    const W = this.scale.width;
    const H = this.scale.height;

    const grid = this.add.graphics().setDepth(-1);
    grid.lineStyle(1, 0xffffff, 0.07);
    for (let x = 0; x <= W; x += 64) {
      grid.beginPath();
      grid.moveTo(x, 0);
      grid.lineTo(x, H);
      grid.strokePath();
    }
    for (let y = 0; y <= H; y += 64) {
      grid.beginPath();
      grid.moveTo(0, y);
      grid.lineTo(W, y);
      grid.strokePath();
    }

    this.drawBanner();

    // 对战测试：场上初始为空，从底部卡牌召唤双方兵种（长枪兵 A 方 vs 剑士 B 方）

    // 底部卡牌栏（点击召唤）
    const cardY = H - CARD_Y_OFFSET;
    this.cards = [
      { kind: 'spearman', x: W / 2 - 80, y: cardY, cooldown: 0 },
      { kind: 'swordsman', x: W / 2 + 80, y: cardY, cooldown: 0 },
    ];

    // 绘制木质底板（静态，只需绘制一次）
    this.barGfx = this.add.graphics().setDepth(48);
    this.drawWoodenBar(W, H);

    this.cardGfx = this.add.graphics().setDepth(50);
    // 注意：卡牌文本现在在drawCards函数中动态创建，这里不再重复创建
    
    // 初始化框选图形
    this.selectGfx = this.add.graphics().setDepth(100);

    // 左键：卡牌召唤 → 框选单位 → 点单位选中；右键：移动/选单位
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        const card = this.cardAt(pointer.x, pointer.y);
        if (card) {
          this.spawnFromCard(card);
          return;
        }
        
        // 开始框选
        this.isSelecting = true;
        this.selectStartX = pointer.x;
        this.selectStartY = pointer.y;
        this.selectEndX = pointer.x;
        this.selectEndY = pointer.y;
        
        // 点击单位选中
        const hit = this.pickUnit(pointer.x, pointer.y);
        if (hit) {
          this.selected = hit;
          this.selectedUnits = [hit];
        } else {
          this.selected = null;
          this.selectedUnits = [];
        }
      } else if (pointer.button === 2) {
        // 右键点中单位 → 选中它（容错：不要求先左键点选）
        const hit = this.pickUnit(pointer.x, pointer.y);
        if (hit) {
          this.selected = hit;
          this.selectedUnits = [hit];
          return;
        }
        // 右键空地 → 选中的单位立刻停止战斗，移动到点击处
        // （移动到位后恢复自动索敌 → 自动发起攻击）
        const unitsToMove = this.selectedUnits.length > 0 ? this.selectedUnits : 
                           (this.selected ? [this.selected] : []);
        
        for (const u of unitsToMove) {
          if (u && u.alive) {
            u.state = 'moving';
            u.moveTarget = { x: pointer.x, y: pointer.y };
            u.target = null;
            u.holdFire = false; // 转移后允许自动参战
            // 打断战斗：approach 阶段武器没放平直接回 none，否则收武器复位
            if (u.combat.phase === 'level' || u.combat.phase === 'stab') {
              u.combat.phase = 'recover';
              u.combat.t = 0;
            } else if (u.combat.phase === 'approach') {
              u.combat.phase = 'none';
              u.combat.t = 0;
            }
          }
        }
      }
    });
    
    // 鼠标移动事件，用于框选和悬停
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hoveredCard = this.cardAt(pointer.x, pointer.y);
      
      if (this.isSelecting) {
        this.selectEndX = pointer.x;
        this.selectEndY = pointer.y;
        this.updateSelection();
      }
    });
    
    // 鼠标释放事件，结束框选
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0 && this.isSelecting) {
        this.isSelecting = false;
        this.selectGfx.clear();
      }
    });
    
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'v') {
        // V：立即停止攻击 —— 清指令、解除目标、收武器复位，并挂起自动索敌
        const unitsToControl = this.selectedUnits.length > 0 ? this.selectedUnits : 
                              (this.selected ? [this.selected] : []);
        
        for (const u of unitsToControl) {
          if (!u || !u.alive) continue;
          u.state = 'idle';
          u.moveTarget = null;
          u.target = null;
          u.holdFire = true;
          if (u.combat.phase === 'level' || u.combat.phase === 'stab') {
            u.combat.phase = 'recover';
            u.combat.t = 0;
          } else if (u.combat.phase === 'approach') {
            u.combat.phase = 'none';
            u.combat.t = 0;
          }
          this.spawnDamageText(u.pos.x, u.pos.y - 96, '停止', '#9fd8c0');
        }
      }
      if (k === 'a') {
        // A：重新开始攻击（解除 holdFire）
        const unitsToControl = this.selectedUnits.length > 0 ? this.selectedUnits : 
                              (this.selected ? [this.selected] : []);
        
        for (const u of unitsToControl) {
          if (!u || !u.alive) continue;
          u.holdFire = false;
          this.orderAttack(u);
          this.spawnDamageText(u.pos.x, u.pos.y - 96, '攻击', '#ffd166');
        }
      }
      if (k === 'k') {
        // K：处决选中的单位
        const unitsToKill = this.selectedUnits.length > 0 ? this.selectedUnits : 
                           (this.selected ? [this.selected] : []);
        
        for (const u of unitsToKill) {
          if (u && u.alive && u.anim.mode !== 'die') this.killUnit(u);
        }
        this.selected = null;
        this.selectedUnits = [];
      }
    });

    // 添加鼠标移动事件，用于卡牌悬停效果
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hoveredCard = this.cardAt(pointer.x, pointer.y);
    });
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);

    // 卡牌冷却
    for (const c of this.cards) {
      if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt);
    }

    // 阶段1：逻辑更新（移动 / 索敌 / 战斗状态机）
    for (const u of this.units) {
      const a = u.anim;
      a.t += dt;

      if (a.mode === 'die') continue; // 死亡动画在绘制阶段处理
      if (!u.alive) continue;

      u.walkPhase += dt * (a.mode === 'walk' ? 7 : 1.2);
      if (u.flash > 0) u.flash -= dt;
      if (u.blockT > 0) u.blockT -= dt; // 剑士格挡姿态倒计时
      if (u.blockCD > 0) u.blockCD -= dt; // 剑士格挡冷却倒计时
      if (u.spearKnock > 0) u.spearKnock -= dt; // 长枪被弹开姿态倒计时
      if (u.retreatCD > 0) u.retreatCD -= dt; // 后撤步冷却倒计时
      if (u.retreatT > 0) {
        // 后撤步动画：沿锁定方向快速后退
        u.retreatT -= dt;
        u.pos.x += u.retreatDir * u.stats.speed * RETREAT_SPEED_MULT * dt;
      }
      if (a.mode === 'hurt' && a.t >= HURT_TOTAL) a.mode = 'idle';

      // 索敌：双方兵种自动参战（仅空闲且未挂起时；V 停止后不再自动参战，
      // 右键移动途中也不打断）
      if (u.stats.damage > 0 && u.state === 'idle' && !u.holdFire) {
        const e = this.nearestEnemyInRange(u, u.stats.aggro);
        if (e) this.orderAttack(u);
      }

      // 移动 / 追击
      const px = u.pos.x;
      const py = u.pos.y;
      if (u.state === 'moving' && u.moveTarget) {
        // 边界检查：确保移动目标不会进入卡牌栏区域
        const maxY = this.scale.height - BAR_HEIGHT - 10; // 卡牌栏上方10px
        if (u.moveTarget.y > maxY) {
          u.moveTarget.y = maxY;
        }
        
        const dx = u.moveTarget.x - u.pos.x;
        const dy = u.moveTarget.y - u.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < 4) {
          u.pos.x = u.moveTarget.x;
          u.pos.y = u.moveTarget.y;
          u.state = 'idle';
          u.moveTarget = null;
        } else {
          const step = Math.min(u.stats.speed * dt, d);
          u.pos.x += (dx / d) * step;
          u.pos.y += (dy / d) * step;
          u.facingRight = dx >= 0;
        }
      }
      if (u.state === 'attacking' && u.stats.damage > 0) {
        this.updateAttack(u, dt);
      }
      const isMoving = u.pos.x !== px || u.pos.y !== py;

      // 战斗姿态状态机（所有兵种）
      {
        const cb = u.combat;
        // 脱离战斗（被右键打断/目标全灭）→ 收武器复位
        // approach 阶段武器还没放平，直接回 none；level/stab 需要 recover 收武器
        if (u.state !== 'attacking') {
          if (cb.phase === 'level' || cb.phase === 'stab') {
            cb.phase = 'recover';
            cb.t = 0;
          } else if (cb.phase === 'approach') {
            cb.phase = 'none';
            cb.t = 0;
          }
        }
        if (cb.phase === 'recover') {
          cb.t += dt;
          if (cb.t >= RECOVER_TIME) cb.phase = 'none';
        }
      }

      if (a.mode !== 'hurt') a.mode = isMoving ? 'walk' : 'idle';
    }

    // 阶段2：伪3D 软分离（同队单位过近时缓慢隔开）
    this.separateUnits(dt);

    // 阶段3：伪3D 深度排序（y 越大越靠"近" → 绘制在上层，可覆盖后方单位）
    this.applyDepthSort();

    // 阶段4：绘制
    for (const u of this.units) {
      if (u.done) continue;
      if (u.anim.mode === 'die') {
        this.updateDeath(u, dt);
        continue;
      }
      this.drawUnit(u);
      this.drawHpBar(u);
    }

    this.units = this.units.filter((u) => !u.done);
    this.drawCards();
  }

  // ---------- 生成 / 指令 ----------

  private spawnUnit(kind: UnitKind, pos: Vec): Unit {
    const st = UNIT_TYPES[kind];
    const gfx = this.add.graphics().setDepth(10);
    const hpBar = this.add.graphics().setDepth(12);
    
    // 确保生成位置不会在卡牌栏下方
    const maxY = this.scale.height - BAR_HEIGHT - 20;
    const safePos = {
      x: pos.x,
      y: Math.min(pos.y, maxY)
    };
    
    const u: Unit = {
      kind,
      stats: st,
      gfx,
      hpBar,
      pos: { ...safePos },
      hp: st.hp,
      state: 'idle',
      holdFire: false,
      moveTarget: null,
      target: null,
      walkPhase: 0,
      facingRight: true,
      alive: true,
      flash: 0,
      blockT: 0,
      blockCD: 0,
      spearKnock: 0,
      critUsed: false,
      retreatCD: 0,
      retreatT: 0,
      retreatDir: 1,
      anim: { mode: 'idle', t: 0, poofed: false },
      combat: { phase: 'none', t: 0, hitThisCycle: false, lastLean: st.restLean, lastX: 0, lastRot: 0 },
      done: false,
    };
    this.units.push(u);
    return u;
  }

  /** 点击卡牌 → 在卡牌上方召唤一个兵种，并自动索敌 */
  private spawnFromCard(card: CardDef) {
    if (card.cooldown > 0) return;
    if (this.units.filter((u) => !u.done).length >= MAX_UNITS) return;
    card.cooldown = CARD_CD;
    
    // 修改：从屏幕左边生成单位，而不是从卡牌上方
    const spawnX = 50; // 屏幕左边50px处
    const maxY = this.scale.height - BAR_HEIGHT - 50; // 卡牌栏上方50px
    const spawnY = Math.min(this.scale.height / 2, maxY); // 确保不超过卡牌栏
    const u = this.spawnUnit(card.kind, { x: spawnX, y: spawnY });
    
    this.selected = u;
    this.selectedUnits = [u];
    this.spawnPoof(u.pos.x, u.pos.y - 4);
    this.spawnDamageText(u.pos.x, u.pos.y - 120, UNIT_TYPES[card.kind].name, '#ffd166');
    
    // 不再自动攻击，因为同阵营不互相攻击
    // const e = this.nearestEnemyInRange(u, u.stats.aggro);
    // if (e) this.orderAttack(u);
  }

  /** 下令攻击：可指定目标（点敌方单位），不指定则自动找最近敌人 */
  private orderAttack(u: Unit, forcedTarget?: Unit | null) {
    u.state = 'attacking';
    u.holdFire = false; // 下令攻击 = 解除挂起，允许自动索敌
    u.target = forcedTarget ?? this.nearestEnemy(u);
    u.critUsed = false; // 换目标 → 下一次命中是暴击
    // 只有找到目标才进入战斗姿态，避免没有敌人时对着空气摆枪
    if (u.target && u.target.alive) {
      if (u.combat.phase === 'none' || u.combat.phase === 'recover') {
        u.combat.phase = 'approach'; // 先接近，再放平武器
        u.combat.t = 0;
        u.combat.hitThisCycle = false;
      }
    } else {
      // 没有目标：保持空闲，不进入战斗
      u.state = 'idle';
      u.target = null;
    }
  }

  /**
   * 战斗算法（所有近战兵种通用）：
   * 1) approach：先移动到敌人同一水平线 + 合适攻击距离（面对敌人）
   * 2) level：原地放平武器瞄准（不移动）
   * 3) stab：突刺/挥砍循环，微调距离
   */
  private updateAttack(u: Unit, dt: number) {
    const cb = u.combat;

    // 记录当前目标，用于检测目标切换
    const prevTarget = u.target;

    if (!u.target || !u.target.alive) {
      u.target = this.nearestEnemy(u);
      u.critUsed = false; // 换目标 → 下一次命中是暴击
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

    // 长枪兵被贴脸 = 敌人进入了**它自己的攻击范围**（+SPEAR_CLOSE_MARGIN 余量修正参照点差）：
    // 后撤冷却好了 → 发动后撤步快速拉开距离；
    // 冷却中 → recover 收枪，站着不动（不再反复后退）。
    const enemyReach = this.tipAtHit(t) - PENETRATION + AIM_BAND + SPEAR_CLOSE_MARGIN;
    const spearTooClose = u.kind === 'spearman' && this.handToAimDist(u, t) < enemyReach;

    // 目标切换检测：如果目标变了，必须重新走完整的攻击流程
    // 避免转身时跳过 level（摆平武器）直接戳空气
    const targetChanged = prevTarget !== t;
    if (targetChanged && (cb.phase === 'level' || cb.phase === 'stab')) {
      // 转身发现新目标很近 → 立即触发撤退（如果冷却好了）
      if (spearTooClose) {
        if (u.retreatCD <= 0 && u.retreatT <= 0) {
          u.retreatCD = RETREAT_CD;
          u.retreatT = RETREAT_DURATION;
          u.retreatDir = u.facingRight ? -1 : 1;
        }
        cb.phase = 'recover';
        cb.t = 0;
        return;
      }
      // 目标不近 → 回到 approach 重新接近
      cb.phase = 'approach';
      cb.t = 0;
      cb.hitThisCycle = false;
    }

    // 贴脸判定：覆盖 approach/level/stab 阶段
    if (spearTooClose && (cb.phase === 'approach' || cb.phase === 'level' || cb.phase === 'stab')) {
      if (u.retreatCD <= 0 && u.retreatT <= 0) {
        // 发动后撤步：一次性快速后退拉开距离
        u.retreatCD = RETREAT_CD;
        u.retreatT = RETREAT_DURATION;
        u.retreatDir = u.facingRight ? -1 : 1; // 锁定后退方向，不再随 facingRight 变化
      }
      // 无论是否发动后撤，都立即 recover（冷却中站着挨打，冷却好了后撤完也老实站）
      cb.phase = 'recover';
      cb.t = 0;
      return;
    }

    // 进入战斗 → 先接近敌人到合适位置
    if (cb.phase === 'none') {
      if (spearTooClose) return; // 贴脸中不重新摆枪
      cb.phase = 'approach';
      cb.t = 0;
    }

    // ---- approach：移动到敌人同一水平线 + 合适攻击距离 ----
    if (cb.phase === 'approach') {
      u.facingRight = t.pos.x >= u.pos.x;
      const arrived = this.approachTarget(u, t, dt);
      if (arrived) {
        cb.phase = 'level';
        cb.t = 0;
      }
      return;
    }

    // ---- level：原地放平武器瞄准（不移动）----
    if (cb.phase === 'level') {
      // 确保面对目标
      u.facingRight = t.pos.x >= u.pos.x;
      cb.t += dt;
      if (cb.t >= LEVEL_TIME) {
        cb.phase = 'stab';
        cb.t = 0;
        cb.hitThisCycle = false;
      }
      return;
    }

    // ---- stab：突刺/挥砍循环，微调距离 ----
    if (cb.phase === 'stab') {
      // 确保面对目标
      u.facingRight = t.pos.x >= u.pos.x;
      const range = this.keepRange(u, t, dt);
      if (u.kind === 'spearman') {
        if (range === 'advance') return;
        cb.t += dt;
        const cyc = cb.t % STAB_CYCLE;
        if (cyc < STAB_RETRACT_END) cb.hitThisCycle = false;
        else if (cyc >= STAB_HIT_AT && !cb.hitThisCycle) {
          cb.hitThisCycle = true;
          this.applyHit(u);
        }
      } else {
        if (range !== 'in-range') return; // 剑士：前进/后退中不挥砍
        cb.t += dt;
        const cyc = cb.t % STAB_CYCLE;
        if (cyc < STAB_RETRACT_END) cb.hitThisCycle = false;
        else if (cyc >= STAB_HIT_AT && !cb.hitThisCycle) {
          cb.hitThisCycle = true;
          this.applyHit(u);
        }
      }
    }
  }

  /**
   * 接近目标：移动到与敌人同一水平线（Y 对齐），并保持合适攻击距离。
   * 长枪兵：先 Y 对齐 → 再 X 方向调整到枪尖刚好够到敌人的距离。
   * 剑士：先 Y 对齐 → 再 X 方向靠近到挥剑距离。
   * 返回 true = 已到位，可以开始放平武器。
   */
  private approachTarget(u: Unit, t: Unit, dt: number): boolean {
    u.facingRight = t.pos.x >= u.pos.x;

    // 目标位置：与敌人同一水平线，保持攻击距离
    const ideal = this.tipAtHit(u) - (u.kind === 'spearman' ? 0 : PENETRATION);
    const targetX = u.facingRight ? t.pos.x - ideal : t.pos.x + ideal;
    const targetY = t.pos.y; // Y 轴对齐到敌人脚下

    // 分两步：先对齐 Y，再对齐 X（Y 优先，因为上下错位是主要问题）
    const dy = Math.abs(u.pos.y - targetY);
    const dx = Math.abs(u.pos.x - targetX);

    // 容差：Y 差距 < 6px 且 X 差距在 AIM_BAND 范围内 → 到位
    if (dy < 6 && dx <= AIM_BAND) {
      u.pos.y = targetY; // 精确对齐
      return true;
    }

    // 先解决 Y 差距（移动到同一水平线）
    if (dy >= 6) {
      const stepY = Math.min(u.stats.speed * dt, dy);
      u.pos.y += u.pos.y < targetY ? stepY : -stepY;
    } else if (u.kind !== 'spearman') {
      // Y 已对齐，调整 X 距离（剑士：前进或后退都允许）
      const stepX = Math.min(u.stats.speed * dt, Math.max(0, dx - AIM_BAND));
      u.pos.x += u.pos.x < targetX ? stepX : -stepX;
    } else {
      // 长枪兵：Y 已对齐，只允许"朝理想距离前进"，不允许倒退。
      // 已比理想距离更近（pastIdeal，含目标在左侧的情况）→ 直接到位进入 level/stab 原地出枪
      // （keepRange 允许长枪兵在射程内任意距离出枪；是否收枪由 updateAttack 的 spearTooClose 判定）。
      // 不能倒退：敌人移速更快时倒退永远到不了理想距离，会被一路追着打
      const pastIdeal = u.facingRight ? u.pos.x >= targetX : u.pos.x <= targetX;
      // 修复：长枪兵需要同时满足以下条件才认为到位：
      // 1. X轴距离合适（pastIdeal）
      // 2. Y轴对齐良好（dy < 6） - 与精确对齐条件一致
      // 这样可以避免在垂直方向上距离较远时直接进入level状态导致"往上戳空气"
      // 同时保持贴脸逻辑不变（贴脸判定在approachTarget之前执行）
      if (pastIdeal && dy < 6) return true;
      const stepX = Math.min(u.stats.speed * dt, dx - AIM_BAND);
      u.pos.x += u.facingRight ? stepX : -stepX;
    }

    return false;
  }

  /** "手→目标中心"距离（与 keepRange 同口径） */
  private handToAimDist(u: Unit, t: Unit): number {
    const aimY = t.pos.y - t.stats.targetCenter;
    const handX = u.pos.x + u.stats.handX * (u.facingRight ? 1 : -1);
    const handY = u.pos.y + u.stats.handY;
    return Math.hypot(t.pos.x - handX, aimY - handY);
  }

  /** 伤害结算时刻的武器尖长度（由该兵种的滑枪位推导，不拍脑袋） */
  private tipAtHit(u: Unit): number {
    const st = u.stats;
    const k = (STAB_HIT_AT - STAB_RETRACT_END) / (STAB_STAB_END - STAB_RETRACT_END);
    const gripAtHit = st.gripRetract + (st.gripStab - st.gripRetract) * k;
    return st.weaponLen - gripAtHit;
  }

  /**
   * 保持武器尖交战距离（核心算法，与兵种无关）：
   * 以"手→目标中心"的距离为基准。
   * 长枪兵：理想距离 = 枪尖长度（枪尖刚碰到敌人就产生伤害，不刺入）；
   * 剑士：理想距离 = 剑尖 − 刺入深度（劈进身体）。
   * 太远 → 前进；太近 → 后退（长枪兵不后退）；合适 → 'in-range' 发动攻击。
   */
  private keepRange(u: Unit, t: Unit, dt: number): 'advance' | 'retreat' | 'in-range' {
    u.facingRight = t.pos.x >= u.pos.x;
    const aim = { x: t.pos.x, y: t.pos.y - t.stats.targetCenter };
    const handX = u.pos.x + u.stats.handX * (u.facingRight ? 1 : -1);
    const handY = u.pos.y + u.stats.handY;
    const d = Math.hypot(aim.x - handX, aim.y - handY);
    const ideal = this.tipAtHit(u) - (u.kind === 'spearman' ? 0 : PENETRATION);

    const tx = t.pos.x - u.pos.x;
    const ty = t.pos.y - u.pos.y;
    const td = Math.hypot(tx, ty) || 1;

    if (d > ideal + AIM_BAND) {
      const step = Math.min(u.stats.speed * dt, d - ideal + AIM_BAND);
      u.pos.x += (tx / td) * step;
      u.pos.y += (ty / td) * step;
      return 'advance';
    }
    if (d < ideal - AIM_BAND) {
      if (u.kind === 'spearman') {
        // 长枪兵被近身后**不后退**：原地不动（还原非战斗姿势由 updateAttack 处理），
        // 避免与追击方的 keepRange 在距离带边缘来回震荡（之前剑士会"发抖"）
        return 'in-range';
      }
      // 剑士：正常后退
      const step = Math.min(u.stats.speed * u.stats.retreatFactor * dt, ideal - d + AIM_BAND);
      u.pos.x -= (tx / td) * step;
      u.pos.y -= (ty / td) * step;
      return 'retreat';
    }
    return 'in-range';
  }

  /** 武器尖瞄准：由"手→目标中心"方向实时求武器前倾角，保证尖指向目标中心 */
  private weaponAimLean(u: Unit, t: Unit): number {
    const aimY = t.pos.y - t.stats.targetCenter;
    const handX = u.pos.x + u.stats.handX * (u.facingRight ? 1 : -1);
    const handY = u.pos.y + u.stats.handY;
    const dx = t.pos.x - handX;
    const dy = aimY - handY;
    const d = Math.hypot(dx, dy) || 1;
    // 武器方向 = (sin lean, -cos lean)；瞄准 = (dx/d, dy/d) → lean = atan2(dx/d, -dy/d)
    const lean = Math.atan2(dx / d, -dy / d);
    return Phaser.Math.Clamp(lean, AIM_LEAN_MIN, AIM_LEAN_MAX);
  }

  private applyHit(u: Unit) {
    const t = u.target;
    if (!t || !t.alive) return;

    // 剑士特性：格挡 —— 30% 概率用圆盾挡住这次攻击（不扣血、不进受击、不被击退）
    // 格挡后攻击者的长枪被弹开 → 长枪兵收枪恢复（非战斗状态），要重新蓄力才能再刺
    // 格挡有冷却（BLOCK_CD）：格挡成功后必须等冷却结束才能再次格挡，防止多单位连续格挡超模
    if (t.kind === 'swordsman' && t.blockCD <= 0 && Math.random() < BLOCK_CHANCE) {
      t.blockT = BLOCK_TIME;
      t.blockCD = BLOCK_CD; // 进入格挡冷却，期间无法再次格挡
      this.spawnPoof(t.pos.x + 10 * (t.facingRight ? 1 : -1), t.pos.y - 48);
      this.spawnDamageText(t.pos.x, t.pos.y - t.stats.targetCenter * 2 - 16, '格挡', '#9fd8c0');
      if (u.combat.phase === 'level' || u.combat.phase === 'stab') {
        u.combat.phase = 'recover';
        u.combat.t = 0;
        u.spearKnock = SPEAR_KNOCK_TIME; // 长枪被弹开（视觉上枪被甩向上方）
      }
      return;
    }

    // 剑士对长枪兵有伤害加成（1.5 倍）
    let dmg = u.stats.damage;
    if (u.kind === 'swordsman' && t.kind === 'spearman') {
      dmg = Math.round(dmg * SWORD_VS_SPEAR_MULT);
    }

    // 长枪兵首击：第一次枪尖接触目标时有 50% 概率暴击（大伤害），否则是普通伤害；
    // 无论是否暴击都算作"首击已出"，之后戳枪都是普通伤害（换目标后重新掷首击）
    let isCrit = false;
    if (u.kind === 'spearman' && !u.critUsed) {
      u.critUsed = true;
      if (Math.random() < CRIT_CHANCE) {
        dmg = Math.round(dmg * CRIT_MULT);
        isCrit = true;
      }
    }

    t.hp -= dmg;
    t.flash = 0.18;
    if (t.anim.mode !== 'die') {
      t.anim.mode = 'hurt';
      t.anim.t = 0;
    }

    // 长枪兵特性：击退 —— 枪尖把敌人沿"攻击者→目标"方向顶回去，
    // 目标 = 枪尖长度（tipAtHit ≈ 146px）；击退量钳制在 [KNOCKBACK_MIN, KNOCKBACK_MAX]
    // （敌人贴身时不会一下被打飞太远，仍能逼近长枪兵）
    if (u.kind === 'spearman') {
      const tip = this.tipAtHit(u);
      const handX = u.pos.x + u.stats.handX * (u.facingRight ? 1 : -1);
      const handY = u.pos.y + u.stats.handY;
      const aim = { x: t.pos.x, y: t.pos.y - t.stats.targetCenter };
      const d = Math.hypot(aim.x - handX, aim.y - handY);
      const push = Phaser.Math.Clamp(tip - d, KNOCKBACK_MIN, KNOCKBACK_MAX);
      if (push > 0.01) {
        const tx = t.pos.x - u.pos.x;
        const ty = t.pos.y - u.pos.y;
        const td = Math.hypot(tx, ty) || 1;
        t.pos.x += (tx / td) * push;
        t.pos.y += (ty / td) * push;
      }
    }

    // 暴击反馈：大号橙色伤害数字 + 枪尖火花 + 「暴击」飘字
    if (isCrit) {
      this.spawnPoof(t.pos.x, t.pos.y - t.stats.targetCenter);
      this.spawnDamageText(t.pos.x, t.pos.y - t.stats.targetCenter * 2 - 26, '暴击!', '#ff9f43', 15);
      this.spawnDamageText(t.pos.x, t.pos.y - t.stats.targetCenter * 2, `-${dmg}`, '#ff9f43', 27);
    } else {
      this.spawnDamageText(t.pos.x, t.pos.y - t.stats.targetCenter * 2, `-${dmg}`);
    }
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
    const flip: 1 | -1 = u.facingRight ? 1 : -1;
    const anim = { flip, rot, xShift, eyeGlow: 0.4 };
    if (u.kind === 'spearman') drawSpearman(u.gfx, SPEARMAN_FINAL, anim);
    else drawSwordsman(u.gfx, SWORDSMAN_FINAL, anim);
    u.gfx.setPosition(u.pos.x, u.pos.y);
    u.gfx.setAlpha(alpha);
    u.hpBar.setAlpha(alpha);
  }

  // ---------- 伪3D：软分离 + 深度排序 ----------

  /**
   * 软分离：同队单位之间"允许叠加但不完全重叠"。
   * 距离小于 SEP_MIN 时，双方沿连线缓慢推开，越近推力越大；
   * 推力是连续渐变的，不会像硬碰撞那样瞬间弹开。
   */
  private separateUnits(dt: number) {
    const list = this.units.filter((u) => !u.done && u.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        // 只同队软分离：跨队允许贴脸近战（剑士要贴到敌人脸上）
        if (a.stats.team !== b.stats.team) continue;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        if (d >= SEP_MIN) continue;
        const nx = d > 0.01 ? dx / d : Math.random() < 0.5 ? -1 : 1;
        const ny = d > 0.01 ? dy / d : 0;
        // 缓慢、连续地推开（指数收敛到 SEP_MIN，不会抖动）
        const step = (SEP_MIN - d) * SEP_RATE * dt;
        a.pos.x -= nx * step * 0.5;
        a.pos.y -= ny * step * 0.5;
        b.pos.x += nx * step * 0.5;
        b.pos.y += ny * step * 0.5;
      }
    }
  }

  /**
   * 伪3D 深度排序：每帧按 y 升序排（y 大 = 更靠近屏幕下方 = 更"近"），
   * 靠前的单位绘制在上层，可以覆盖靠后的单位 → 实现叠加伪3D。
   */
  private applyDepthSort() {
    const list = this.units.filter((u) => !u.done);
    list.sort((a, b) => a.pos.y - b.pos.y);
    list.forEach((u, i) => {
      const base = 10 + i;
      u.gfx.setDepth(base);
      u.hpBar.setDepth(base + 2);
    });
  }

  // ---------- 绘制 ----------

  private drawUnit(u: Unit) {
    const a = u.anim;
    const now = this.time.now / 1000;

    const st = u.stats;

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
    let weaponLean = st.restLean;
    let xShift = 0;
    let grip = st.gripRest;
    let handLift = 0; // 剑士：举剑蓄力 0..1
    if (cb.phase === 'level' || cb.phase === 'stab') {
      bob = 0; // 战斗时身体稳住，只有武器和姿态在动
    }
    if (u.kind === 'spearman') {
      // 长枪兵：放平枪 + 滑枪刺击（瞄准每帧更新）
      if (cb.phase === 'level') {
        const k = easeOut(Math.min(1, cb.t / LEVEL_TIME));
        const aim = u.target ? this.weaponAimLean(u, u.target) : COMBAT_LEAN;
        cb.lastLean = st.restLean + (aim - st.restLean) * k;
        cb.lastRot = 0.04 * k;
        cb.lastX = 0;
        weaponLean = cb.lastLean;
        rot += cb.lastRot;
        eyeGlow = Math.max(eyeGlow, 1.3);
        if (a.mode !== 'walk') {
          // 静止放平：摆开战斗架势（移动中保持行走摆腿）
          legSwing = 0.35;
          legLift = 0.2;
        }
      } else if (cb.phase === 'stab') {
        // 每帧瞄准：枪尖实时指向目标中心
        cb.lastLean = u.target ? this.weaponAimLean(u, u.target) : COMBAT_LEAN;
        cb.lastRot = 0.05;
        weaponLean = cb.lastLean;
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
          grip = st.gripRest + (st.gripRetract - st.gripRest) * k;
          cb.lastX = -3 * k;
        } else if (cyc < STAB_STAB_END) {
          const k = (cyc - STAB_RETRACT_END) / (STAB_STAB_END - STAB_RETRACT_END);
          grip = st.gripRetract + (st.gripStab - st.gripRetract) * k;
          cb.lastX = -3 + 12 * k;
          eyeGlow = 2;
        } else {
          grip = st.gripStab;
          cb.lastX = 9;
        }
        xShift += cb.lastX;
      }
    } else {
      // 剑士：举剑蓄力 → 至上而下挥砍（与长枪兵的滑枪刺击完全不同）
      const windup = -0.85; // 举剑角：剑尖朝上偏后
      if (cb.phase === 'level') {
        const k = easeOut(Math.min(1, cb.t / LEVEL_TIME));
        cb.lastLean = st.restLean + (windup - st.restLean) * k;
        cb.lastRot = -0.04 * k;
        cb.lastX = 0;
        weaponLean = cb.lastLean;
        handLift = k;
        rot += cb.lastRot;
        eyeGlow = Math.max(eyeGlow, 1.2);
        if (a.mode !== 'walk') {
          legSwing = 0.35;
          legLift = 0.2;
        }
      } else if (cb.phase === 'stab') {
        const aim = u.target ? this.weaponAimLean(u, u.target) : COMBAT_LEAN;
        const cyc = cb.t % STAB_CYCLE;
        if (cyc < STAB_RETRACT_END) {
          // 举剑蓄力（保持）
          const k = cyc / STAB_RETRACT_END;
          cb.lastLean = windup;
          cb.lastRot = -0.05 * k;
          cb.lastX = -3 * k;
          handLift = 1;
        } else if (cyc < STAB_HIT_AT) {
          // 挥砍下落：命中时刻剑恰好指向目标
          const k = (cyc - STAB_RETRACT_END) / (STAB_HIT_AT - STAB_RETRACT_END);
          cb.lastLean = windup + (aim - windup) * easeOut(k);
          cb.lastRot = -0.05 + 0.08 * k;
          cb.lastX = -3 + 9 * k;
          handLift = 1 - k;
          eyeGlow = 2;
        } else if (cyc < STAB_STAB_END) {
          // 顺势下劈（跟手）
          const k = (cyc - STAB_HIT_AT) / (STAB_STAB_END - STAB_HIT_AT);
          cb.lastLean = aim + 0.45 * k;
          cb.lastRot = 0.03 + 0.02 * k;
          cb.lastX = 6 + 3 * k;
          handLift = 0;
        } else {
          cb.lastLean = aim + 0.45;
          cb.lastRot = 0.05;
          cb.lastX = 9;
          handLift = 0;
        }
        weaponLean = cb.lastLean;
        xShift += cb.lastX;
        rot += cb.lastRot;
        eyeGlow = Math.max(eyeGlow, 1.5);
        if (a.mode !== 'walk') {
          legSwing = 0.35;
          legLift = 0.25;
        }
      }
    }
    if (cb.phase === 'recover') {
      const k = easeInOut(Math.min(1, cb.t / RECOVER_TIME));
      weaponLean = cb.lastLean + (st.restLean - cb.lastLean) * k;
      rot += cb.lastRot * (1 - k);
      xShift += cb.lastX * (1 - k);
      cb.lastLean = weaponLean;
      cb.lastRot = cb.lastRot * (1 - k);
      cb.lastX = cb.lastX * (1 - k);
    }

    // 剑士格挡姿态：盾牌举起护身（覆盖当前武器动作，身体后仰）
    let shieldK = 0;
    if (u.kind === 'swordsman' && u.blockT > 0) {
      const elapsed = BLOCK_TIME - u.blockT;
      const up = Math.min(1, elapsed / 0.1); // 0.1s 内快速举起
      const down = Math.min(1, u.blockT / 0.15); // 最后 0.15s 放下
      shieldK = Math.min(up, down);
      rot -= 0.1 * shieldK; // 身体后仰躲进盾后
      weaponLean = 0.08; // 剑收回护身
      handLift = 0;
      xShift = -2 * shieldK;
      eyeGlow = Math.max(eyeGlow, 1.2);
    }

    // 长枪兵：长枪被剑士格挡弹开 —— 枪被甩向上方（0.35s 内快速弹开）
    if (u.kind === 'spearman' && u.spearKnock > 0) {
      const k = Math.min(1, u.spearKnock / 0.12);
      weaponLean = Phaser.Math.Linear(weaponLean, -0.9, k); // 枪被弹向上方
      rot -= 0.06 * k;
      xShift -= 3 * k;
      eyeGlow = Math.max(eyeGlow, 1.1);
    }

    const flip = u.facingRight ? 1 : -1;
    if (u.kind === 'spearman') {
      drawSpearman(u.gfx, SPEARMAN_FINAL, {
        flip,
        bob,
        rot,
        xShift,
        legSwing,
        legLift,
        spearLean: weaponLean,
        grip,
        capeSway,
        eyeGlow,
        flash: u.flash, // 受击闪白（0.18s 内衰减，见 applyHit）
      });
    } else {
      drawSwordsman(u.gfx, SWORDSMAN_FINAL, {
        flip,
        bob,
        rot,
        xShift,
        legSwing,
        legLift,
        weaponLean,
        grip,
        handLift,
        shieldBlock: shieldK,
        eyeGlow,
        flash: u.flash, // 受击闪白（0.18s 内衰减，见 applyHit）
      });
    }
    u.gfx.setPosition(u.pos.x, u.pos.y);
    u.gfx.setAlpha(1);
  }

  private drawHpBar(u: Unit) {
    const g = u.hpBar;
    g.clear();
    const w = 40;
    const h = 6;
    const x = u.pos.x - w / 2;
    const y = u.pos.y - u.stats.hpBarY;
    // 底 + 边框
    g.fillStyle(0x000000, 0.62);
    g.fillRoundedRect(x - 1.5, y - 1.5, w + 3, h + 3, 2.5);
    g.lineStyle(1.5, 0xffffff, 0.35);
    g.strokeRoundedRect(x - 1.5, y - 1.5, w + 3, h + 3, 2.5);
    // 血量（统一为绿色，因为都是A阵营）
    const pct = Phaser.Math.Clamp(u.hp / u.stats.hp, 0, 1);
    g.fillStyle(0x66cc66, 1); // 统一绿色
    g.fillRoundedRect(x, y, Math.max(0.01, w * pct), h, 1.5);
    // 默认不显示，选中才显示（死亡时透明度由 updateDeath 接管）
    const isSelected = this.selectedUnits.includes(u) || u === this.selected;
    g.setAlpha(isSelected ? 1 : 0);
  }

  // ---------- 木质卡牌底板 ----------

  /**
   * 绘制有质感的木质底部卡牌栏：
   * - 深色实木底板（多层渐变模拟木纹）
   * - 顶部/底部金属装饰条
   * - 四角金属铆钉
   * - 皮革内衬凹槽
   * - 顶部高光和底部阴影
   */
  private drawWoodenBar(W: number, H: number) {
    const g = this.barGfx;
    const barY = H - BAR_HEIGHT;
    const barX = BAR_PADDING;
    const barW = W - BAR_PADDING * 2;

    // ---- 底层阴影（营造悬浮感）----
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(barX + 3, barY + 5, barW, BAR_HEIGHT, 8);

    // ---- 主木质底板 ----
    // 基础深棕色木底
    g.fillStyle(0x3d2b1f, 1);
    g.fillRoundedRect(barX, barY, barW, BAR_HEIGHT, 8);

    // 木纹纹理层1：横向条纹（深色）
    g.fillStyle(0x2a1e14, 0.6);
    for (let i = 0; i < 12; i++) {
      const stripeY = barY + 8 + i * 8;
      const stripeH = 2 + Math.sin(i * 0.8) * 1;
      g.fillRect(barX + 4, stripeY, barW - 8, stripeH);
    }

    // 木纹纹理层2：横向亮纹（浅色，错位）
    g.fillStyle(0x5a4232, 0.4);
    for (let i = 0; i < 10; i++) {
      const stripeY = barY + 12 + i * 10;
      const stripeH = 1.5;
      g.fillRect(barX + 6, stripeY, barW - 12, stripeH);
    }

    // 木纹纹理层3：斜向纹路（增加自然感）
    g.lineStyle(1, 0x2a1e14, 0.3);
    for (let i = 0; i < 6; i++) {
      const startX = barX + 20 + i * 80;
      g.beginPath();
      g.moveTo(startX, barY + 10);
      g.lineTo(startX + 40, barY + BAR_HEIGHT - 10);
      g.strokePath();
    }

    // ---- 顶部高光（模拟光源从上方照射）----
    g.fillStyle(0x6b5242, 0.5);
    g.fillRoundedRect(barX, barY, barW, 15, { tl: 8, tr: 8, bl: 0, br: 0 });

    // 渐变高光（更自然）
    g.fillStyle(0x7a6352, 0.3);
    g.fillRoundedRect(barX + 2, barY + 2, barW - 4, 8, { tl: 6, tr: 6, bl: 0, br: 0 });

    // ---- 底部阴影（增加深度）----
    g.fillStyle(0x1a1008, 0.6);
    g.fillRoundedRect(barX, barY + BAR_HEIGHT - 12, barW, 12, { tl: 0, tr: 0, bl: 8, br: 8 });

    // ---- 顶部金属装饰条 ----
    const metalTopY = barY;
    // 金属条主体（亮钢色）
    g.fillStyle(0x8a9aa8, 1);
    g.fillRect(barX + 8, metalTopY + 3, barW - 16, METAL_STRIP_H);
    // 金属条高光
    g.fillStyle(0xb8c8d8, 0.7);
    g.fillRect(barX + 10, metalTopY + 3, barW - 20, 2);
    // 金属条底部阴影
    g.fillStyle(0x4a5a68, 0.8);
    g.fillRect(barX + 8, metalTopY + METAL_STRIP_H + 1, barW - 16, 2);

    // ---- 底部金属装饰条 ----
    const metalBotY = barY + BAR_HEIGHT - METAL_STRIP_H - 4;
    g.fillStyle(0x8a9aa8, 1);
    g.fillRect(barX + 8, metalBotY, barW - 16, METAL_STRIP_H);
    g.fillStyle(0xb8c8d8, 0.7);
    g.fillRect(barX + 10, metalBotY, barW - 20, 2);
    g.fillStyle(0x4a5a68, 0.8);
    g.fillRect(barX + 8, metalBotY + METAL_STRIP_H, barW - 16, 2);

    // ---- 四角金属铆钉 ----
    const rivetPositions = [
      { x: barX + 18, y: barY + 12 },
      { x: barX + barW - 18, y: barY + 12 },
      { x: barX + 18, y: barY + BAR_HEIGHT - 12 },
      { x: barX + barW - 18, y: barY + BAR_HEIGHT - 12 },
    ];

    for (const pos of rivetPositions) {
      // 铆钉阴影
      g.fillStyle(0x000000, 0.5);
      g.fillCircle(pos.x + 1, pos.y + 1, RIVET_RADIUS);
      // 铆钉主体（金属色）
      g.fillStyle(0x9aa8b8, 1);
      g.fillCircle(pos.x, pos.y, RIVET_RADIUS);
      // 铆钉高光（左上角）
      g.fillStyle(0xd0e0f0, 0.8);
      g.fillCircle(pos.x - 1.2, pos.y - 1.2, RIVET_RADIUS * 0.4);
      // 铆钉阴影（右下角）
      g.fillStyle(0x4a5a68, 0.6);
      g.fillCircle(pos.x + 0.8, pos.y + 0.8, RIVET_RADIUS * 0.3);
      // 铆钉外圈
      g.lineStyle(1, 0x4a5a68, 0.8);
      g.strokeCircle(pos.x, pos.y, RIVET_RADIUS);
    }

    // ---- 中间额外铆钉（装饰）----
    const midRivets = [
      { x: barX + barW * 0.25, y: barY + 12 },
      { x: barX + barW * 0.5, y: barY + 12 },
      { x: barX + barW * 0.75, y: barY + 12 },
      { x: barX + barW * 0.25, y: barY + BAR_HEIGHT - 12 },
      { x: barX + barW * 0.5, y: barY + BAR_HEIGHT - 12 },
      { x: barX + barW * 0.75, y: barY + BAR_HEIGHT - 12 },
    ];
    for (const pos of midRivets) {
      g.fillStyle(0x000000, 0.4);
      g.fillCircle(pos.x + 1, pos.y + 1, 3);
      g.fillStyle(0x8a9aa8, 1);
      g.fillCircle(pos.x, pos.y, 3);
      g.fillStyle(0xc0d0e0, 0.6);
      g.fillCircle(pos.x - 0.8, pos.y - 0.8, 1.2);
      g.lineStyle(0.8, 0x4a5a68, 0.7);
      g.strokeCircle(pos.x, pos.y, 3);
    }

    // ---- 皮革内衬凹槽（卡牌放置区域）----
    for (const c of this.cards) {
      const leatherX = c.x - CARD_W / 2 - LEATHER_INSET;
      const leatherY = c.y - CARD_H / 2 - LEATHER_INSET;
      const leatherW = CARD_W + LEATHER_INSET * 2;
      const leatherH = CARD_H + LEATHER_INSET * 2;

      // 凹槽阴影（内凹效果）
      g.fillStyle(0x0a0604, 0.7);
      g.fillRoundedRect(leatherX, leatherY, leatherW, leatherH, 10);

      // 皮革底色（深棕色）
      g.fillStyle(0x2a1e14, 0.9);
      g.fillRoundedRect(leatherX + 1, leatherY + 1, leatherW - 2, leatherH - 2, 9);

      // 皮革纹理（细微颗粒感）
      g.fillStyle(0x3a2e24, 0.3);
      for (let i = 0; i < 20; i++) {
        const px = leatherX + 4 + Math.random() * (leatherW - 8);
        const py = leatherY + 4 + Math.random() * (leatherH - 8);
        g.fillCircle(px, py, 1.5);
      }

      // 皮革边缘高光（上、左）
      g.lineStyle(1.5, 0x4a3a2a, 0.5);
      g.beginPath();
      g.moveTo(leatherX + 4, leatherY + 2);
      g.lineTo(leatherX + leatherW - 4, leatherY + 2);
      g.strokePath();
      g.beginPath();
      g.moveTo(leatherX + 2, leatherY + 4);
      g.lineTo(leatherX + 2, leatherY + leatherH - 4);
      g.strokePath();

      // 皮革边缘阴影（下、右）
      g.lineStyle(1.5, 0x0a0604, 0.6);
      g.beginPath();
      g.moveTo(leatherX + 4, leatherY + leatherH - 2);
      g.lineTo(leatherX + leatherW - 4, leatherY + leatherH - 2);
      g.strokePath();
      g.beginPath();
      g.moveTo(leatherX + leatherW - 2, leatherY + 4);
      g.lineTo(leatherX + leatherW - 2, leatherY + leatherH - 4);
      g.strokePath();
    }

    // ---- 左右两侧金属装饰片 ----
    const sideMetalW = 6;
    // 左侧
    g.fillStyle(0x7a8a98, 1);
    g.fillRect(barX, barY + 15, sideMetalW, BAR_HEIGHT - 30);
    g.fillStyle(0xa0b0c0, 0.5);
    g.fillRect(barX, barY + 15, 2, BAR_HEIGHT - 30);
    g.fillStyle(0x3a4a58, 0.6);
    g.fillRect(barX + 4, barY + 15, 2, BAR_HEIGHT - 30);
    // 右侧
    g.fillStyle(0x7a8a98, 1);
    g.fillRect(barX + barW - sideMetalW, barY + 15, sideMetalW, BAR_HEIGHT - 30);
    g.fillStyle(0xa0b0c0, 0.5);
    g.fillRect(barX + barW - 2, barY + 15, 2, BAR_HEIGHT - 30);
    g.fillStyle(0x3a4a58, 0.6);
    g.fillRect(barX + barW - 6, barY + 15, 2, BAR_HEIGHT - 30);
  }

  // ---------- 底部卡牌 ----------

  private cardAt(x: number, y: number): CardDef | null {
    for (const c of this.cards) {
      // 增加点击检测区域，提供更好的交互体验
      const hitW = CARD_W / 2 + 5;
      const hitH = CARD_H / 2 + 5;
      if (Math.abs(x - c.x) <= hitW && Math.abs(y - c.y) <= hitH) return c;
    }
    return null;
  }

  private drawCards() {
    const g = this.cardGfx;
    g.clear();
    for (const c of this.cards) {
      const accent = c.kind === 'spearman' ? 0x3fe0c0 : 0xe07a3a;
      const accentDark = c.kind === 'spearman' ? 0x2aa088 : 0xb86028;
      const accentLight = c.kind === 'spearman' ? 0x7fffe0 : 0xffb366;
      const x = c.x - CARD_W / 2;
      const y = c.y - CARD_H / 2;
      
      // 检查是否悬停
      const isHovered = this.hoveredCard === c;
      const isClickable = c.cooldown <= 0;

      // 卡牌阴影（营造浮在皮革上的效果，多层阴影更立体）
      g.fillStyle(0x000000, 0.4);
      g.fillRoundedRect(x + 3, y + 4, CARD_W, CARD_H, 8);
      g.fillStyle(0x000000, 0.2);
      g.fillRoundedRect(x + 1, y + 2, CARD_W, CARD_H, 8);
      
      // 悬停效果：发光边框和提升效果
      if (isHovered && isClickable) {
        g.fillStyle(accent, 0.15);
        g.fillRoundedRect(x - 2, y - 2, CARD_W + 4, CARD_H + 4, 10);
        g.lineStyle(3, accent, 0.8);
        g.strokeRoundedRect(x - 2, y - 2, CARD_W + 4, CARD_H + 4, 10);
      }

      // 卡底（羊皮纸质感，多层渐变）
      g.fillStyle(0x1a1e28, 0.97);
      g.fillRoundedRect(x, y, CARD_W, CARD_H, 8);
      
      // 内发光效果（营造深度感）
      g.fillStyle(accent, isHovered && isClickable ? 0.1 : 0.05);
      g.fillRoundedRect(x + 2, y + 2, CARD_W - 4, CARD_H - 4, 6);

      // 卡牌内纹理（更细腻的网格纹理，模拟羊皮纸）
      g.lineStyle(0.3, 0x2a2e38, 0.25);
      // 横向纹理
      for (let i = 0; i < 9; i++) {
        const lineY = y + 8 + i * 9;
        g.beginPath();
        g.moveTo(x + 5, lineY);
        g.lineTo(x + CARD_W - 5, lineY);
        g.strokePath();
      }
      // 纵向纹理（增加纸张质感）
      for (let i = 0; i < 6; i++) {
        const lineX = x + 15 + i * 18;
        g.beginPath();
        g.moveTo(lineX, y + 5);
        g.lineTo(lineX, y + CARD_H - 5);
        g.strokePath();
      }

      // 顶部 accent 色带（带渐变效果）
      g.fillStyle(accentDark, 0.9);
      g.fillRoundedRect(x, y, CARD_W, 8, { tl: 8, tr: 8, bl: 0, br: 0 });
      // 色带高光
      g.fillStyle(accentLight, 0.3);
      g.fillRoundedRect(x + 2, y + 1, CARD_W - 4, 3, { tl: 6, tr: 6, bl: 0, br: 0 });

      // accent 描边（金属感，双层描边更精致）
      g.lineStyle(2.5, accent, 0.95);
      g.strokeRoundedRect(x, y, CARD_W, CARD_H, 8);
      // 内层细描边（增加层次感）
      g.lineStyle(1, accentLight, 0.4);
      g.strokeRoundedRect(x + 2, y + 2, CARD_W - 4, CARD_H - 4, 6);

      // 内部装饰线（更精致的边框）
      g.lineStyle(1.5, accent, 0.35);
      g.strokeRoundedRect(x + 5, y + 5, CARD_W - 10, CARD_H - 10, 5);
      // 角落装饰点
      const cornerSize = 3;
      g.fillStyle(accent, 0.6);
      g.fillCircle(x + 10, y + 10, cornerSize);
      g.fillCircle(x + CARD_W - 10, y + 10, cornerSize);
      g.fillCircle(x + 10, y + CARD_H - 10, cornerSize);
      g.fillCircle(x + CARD_W - 10, y + CARD_H - 10, cornerSize);

      // 图标（迷你武器剪影）
      this.drawCardIcon(g, c.kind, c.x, c.y + 12, accent);

      // 兵种名称（更精致的字体效果）
      const st = UNIT_TYPES[c.kind];
      this.add
        .text(c.x, c.y - 22, st.name, {
          fontFamily: '"华文行楷", "STXingkai", Georgia, "Times New Roman", serif',
          fontSize: '16px',
          color: '#f0e6d6',
          stroke: '#000000',
          strokeThickness: 4,
          shadow: {
            offsetX: 1,
            offsetY: 1,
            color: '#000000',
            blur: 2,
            fill: true
          }
        })
        .setOrigin(0.5)
        .setDepth(51);

      // 冷却遮罩 + 恢复条（更精美的冷却效果）
      if (c.cooldown > 0) {
        const k = c.cooldown / CARD_CD;
        // 冷却遮罩（更深，带渐变）
        g.fillStyle(0x000000, 0.7 * k);
        g.fillRoundedRect(x, y, CARD_W, CARD_H, 8);
        
        // 恢复条背景（带边框）
        g.fillStyle(0x000000, 0.6);
        g.fillRoundedRect(x + 8, y + CARD_H - 16, CARD_W - 16, 8, 4);
        g.lineStyle(1, 0x333333, 0.8);
        g.strokeRoundedRect(x + 8, y + CARD_H - 16, CARD_W - 16, 8, 4);
        
        // 恢复条（发光效果，带渐变）
        const barWidth = (CARD_W - 16) * (1 - k);
        g.fillStyle(accent, 0.9);
        g.fillRoundedRect(x + 8, y + CARD_H - 16, barWidth, 8, 4);
        
        // 恢复条高光（更明显的发光）
        g.fillStyle(0xffffff, 0.5 * (1 - k));
        g.fillRoundedRect(x + 8, y + CARD_H - 16, barWidth, 4, { tl: 4, tr: 4, bl: 0, br: 0 });
        
        // 恢复条发光点（动态效果）
        if (barWidth > 10) {
          g.fillStyle(0xffffff, 0.8 * (1 - k));
          g.fillCircle(x + 8 + barWidth - 4, y + CARD_H - 12, 2);
        }
        
        // 冷却时间数字（更清晰的显示）
        const cdText = Math.ceil(c.cooldown * 10) / 10;
        this.add
          .text(c.x, c.y + 20, `${cdText}s`, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(52)
          .setAlpha(0.9);
      }
    }
  }

  private drawCardIcon(g: Phaser.GameObjects.Graphics, kind: UnitKind, cx: number, cy: number, accent: number) {
    g.save();
    g.translateCanvas(cx, cy);
    g.rotateCanvas(-0.4); // 斜放更有动感
    
    if (kind === 'spearman') {
      // 精致长枪图标
      // 枪杆（带渐变效果）
      g.lineStyle(4, 0x8a9aa8, 1);
      g.beginPath();
      g.moveTo(-20, 22);
      g.lineTo(16, -18);
      g.strokePath();
      
      // 枪杆高光
      g.lineStyle(2, 0xb8c8d8, 0.7);
      g.beginPath();
      g.moveTo(-18, 20);
      g.lineTo(14, -16);
      g.strokePath();
      
      // 枪头（更精致的菱形）
      g.fillStyle(0xd0d6de, 1);
      g.fillTriangle(20, -24, 14, -13, 26, -16);
      // 枪头高光
      g.fillStyle(0xffffff, 0.6);
      g.fillTriangle(18, -22, 15, -15, 22, -18);
      
      // 枪缨（accent色装饰）
      g.lineStyle(2, accent, 0.9);
      g.beginPath();
      g.moveTo(-12, 25);
      g.lineTo(12, 5);
      g.strokePath();
      // 枪缨装饰点
      g.fillStyle(accent, 0.8);
      g.fillCircle(-8, 22, 2);
      g.fillCircle(8, 8, 2);
      
    } else {
      // 精致剑盾图标
      // 剑身（带渐变效果）
      g.lineStyle(5, 0xa0a8b0, 1);
      g.beginPath();
      g.moveTo(0, -24);
      g.lineTo(0, 14);
      g.strokePath();
      
      // 剑身高光
      g.lineStyle(2, 0xd0d8e0, 0.8);
      g.beginPath();
      g.moveTo(0, -22);
      g.lineTo(0, 12);
      g.strokePath();
      
      // 剑柄（更精致）
      g.lineStyle(3, 0x6a4a2a, 1);
      g.beginPath();
      g.moveTo(-10, 4);
      g.lineTo(10, 4);
      g.strokePath();
      
      // 剑柄装饰
      g.fillStyle(0x8a6a3a, 1);
      g.fillCircle(-8, 4, 2);
      g.fillCircle(8, 4, 2);
      
      // 剑柄底部
      g.fillStyle(0x5a4630, 1);
      g.fillCircle(0, 18, 3);
      g.fillStyle(0x7a6640, 1);
      g.fillCircle(0, 18, 2);
      
      // 圆盾（更精致的盾牌）
      // 盾牌主体
      g.fillStyle(0x2a323a, 1);
      g.fillCircle(18, 6, 10);
      
      // 盾牌边框（accent色）
      g.lineStyle(2, accent, 0.95);
      g.strokeCircle(18, 6, 10);
      
      // 盾牌装饰（十字纹）
      g.lineStyle(1.5, accent, 0.7);
      g.beginPath();
      g.moveTo(18, -2);
      g.lineTo(18, 14);
      g.strokePath();
      g.beginPath();
      g.moveTo(10, 6);
      g.lineTo(26, 6);
      g.strokePath();
      
      // 盾牌中心凸起
      g.fillStyle(accent, 0.9);
      g.fillCircle(18, 6, 4);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(17, 5, 1.5);
      
      // 盾牌高光
      g.fillStyle(0xffffff, 0.3);
      g.fillCircle(16, 4, 2);
    }
    
    g.restore();
  }

  // ---------- 框选 ----------
  
  private updateSelection() {
    // 绘制框选矩形
    this.selectGfx.clear();
    this.selectGfx.lineStyle(2, 0x00ff00, 0.8);
    this.selectGfx.strokeRect(
      Math.min(this.selectStartX, this.selectEndX),
      Math.min(this.selectStartY, this.selectEndY),
      Math.abs(this.selectEndX - this.selectStartX),
      Math.abs(this.selectEndY - this.selectStartY)
    );
    
    // 计算框选区域，确保不超出卡牌栏边界
    const left = Math.min(this.selectStartX, this.selectEndX);
    const right = Math.max(this.selectStartX, this.selectEndX);
    const top = Math.min(this.selectStartY, this.selectEndY);
    const bottom = Math.min(
      Math.max(this.selectStartY, this.selectEndY),
      this.scale.height - BAR_HEIGHT - 10 // 卡牌栏上方10px
    );
    
    // 选择框内的单位
    this.selectedUnits = [];
    for (const u of this.units) {
      if (!u.alive || u.anim.mode === 'die') continue;
      if (u.pos.x >= left && u.pos.x <= right && u.pos.y >= top && u.pos.y <= bottom) {
        this.selectedUnits.push(u);
      }
    }
    
    // 如果有选中的单位，设置第一个为当前选中单位
    if (this.selectedUnits.length > 0) {
      this.selected = this.selectedUnits[0];
    }
  }

  // ---------- 拾取 ----------

  private pickUnit(x: number, y: number): Unit | null {
    // 确保不会选择到卡牌栏下方的单位
    const maxY = this.scale.height - BAR_HEIGHT - 10;
    if (y > maxY) return null;
    
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (!u.alive || u.anim.mode === 'die') continue;
      const cy = u.pos.y - u.stats.pickOffset;
      if (Math.hypot(x - u.pos.x, y - cy) <= 34) return u;
    }
    return null;
  }

  private nearestEnemy(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const other of this.units) {
      if (!other.alive || other.anim.mode === 'die' || other.stats.team === u.stats.team) continue;
      const d = Math.hypot(other.pos.x - u.pos.x, other.pos.y - u.pos.y);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }

  private nearestEnemyInRange(u: Unit, range: number): Unit | null {
    let best: Unit | null = null;
    let bestD = range;
    for (const other of this.units) {
      if (!other.alive || other.anim.mode === 'die' || other.stats.team === u.stats.team) continue;
      const d = Math.hypot(other.pos.x - u.pos.x, other.pos.y - u.pos.y);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }

  // ---------- 特效 ----------

  private spawnDamageText(x: number, y: number, str: string, color = '#ff5252', size = 20) {
    const txt = this.add
      .text(x, y, str, {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${size}px`,
        color,
        stroke: '#000000',
        strokeThickness: size > 20 ? 5 : 4,
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
    g.fillRoundedRect(16, 14, 700, 40, 10);
    this.add
      .text(36, 34, '点击卡牌召唤 ｜ 左键选中·点敌方攻击 ｜ 右键移动 ｜ V 停止 ｜ A 攻击 ｜ K 处决', {
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
