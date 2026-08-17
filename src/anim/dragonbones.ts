/**
 * 程序化骨骼动画运行时（anim/dragonbones.ts）—— 纯逻辑，禁止 import 渲染。
 *
 * 数据格式为 **DragonBones 5.5 导出 JSON 的兼容子集**（字段名与结构一致）：
 *  - bone:  name / parent / transform{ x, y, rotate, skew, scaleX, scaleY }
 *  - slot:  name / bone / displayIndex
 *  - animation: name / duration / playTimes / boneTimelines[
 *      { bone, translateFrame[], rotateFrame[], scaleFrame[] } ] / eventTimelines
 *
 * 约定（本运行时自洽，未来对接真实编辑器数据时在阶段验收中校准）：
 *  - rotate/skew 单位：弧度；y 向下为正，正旋转 = 顺时针（与 Pixi/Canvas 一致）。
 *  - 关键帧数值为骨骼**局部绝对变换**；无时间线的骨骼保持静止姿态。
 *  - 骨骼变换语义：本地矩阵 = T(x,y) · R(rotate) · S(scale)，再与父世界矩阵复合。
 *
 * 设计目标（需求 3.3 / 6.3）：
 *  - 新增动作 = 加数据，不改代码；
 *  - 未来用编辑器产出 DragonBones/Spine 数据**同名替换**即可，运行时与游戏逻辑不动。
 */

export interface Mat2x3 {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function identityMat(): Mat2x3 {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

/** —— 数据接口（DragonBones 兼容子集） —— */

export interface BoneTransformData {
  x?: number;
  y?: number;
  /** 弧度，正 = 顺时针（y 向下） */
  rotate?: number;
  /** 弧度（当前运行时按 0 处理，仅保留字段兼容） */
  skew?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface BoneData {
  name: string;
  parent?: string | null;
  transform?: BoneTransformData;
}

export interface SlotData {
  name: string;
  bone: string;
  /** 默认显示索引（0 = 显示第一个 display） */
  displayIndex?: number;
}

/** tweenEasing：'line' = 线性；数值 = DragonBones 缓动系数 */
export type TweenEasing = number | 'line';

export interface TranslateFrameData {
  duration: number;
  tweenEasing?: TweenEasing;
  x: number;
  y: number;
}

export interface RotateFrameData {
  duration: number;
  tweenEasing?: TweenEasing;
  rotate: number;
  skew?: number;
}

export interface ScaleFrameData {
  duration: number;
  tweenEasing?: TweenEasing;
  scaleX: number;
  scaleY: number;
}

export interface BoneTimelineData {
  bone: string;
  translateFrame?: TranslateFrameData[];
  rotateFrame?: RotateFrameData[];
  scaleFrame?: ScaleFrameData[];
}

export interface EventFrameData {
  duration: number;
  events: { name: string }[];
}

export interface EventTimelineData {
  /** 事件挂在哪根骨头上（可选，仅用于定位信息） */
  bone?: string;
  frame: EventFrameData[];
}

export interface AnimationData {
  name: string;
  duration: number;
  /** -1 / 0 / 缺省 = 循环；>0 = 播放次数 */
  playTimes?: number;
  boneTimelines?: BoneTimelineData[];
  eventTimelines?: EventTimelineData[];
}

export interface ArmatureData {
  name: string;
  bone: BoneData[];
  slot: SlotData[];
  animation: AnimationData[];
}

export interface SkeletonData {
  name: string;
  frameRate?: number;
  armature: ArmatureData[];
}

/** —— 运行时 —— */

/** 骨骼运行态：静止姿态（来自骨架数据）+ 动画采样结果的混合 */
export class BoneState {
  readonly name: string;
  parent: BoneState | null = null;
  /** 静止姿态 */
  restX = 0;
  restY = 0;
  restRot = 0;
  restScaleX = 1;
  restScaleY = 1;
  /** 当前本地变换（动画混合后的结果） */
  x = 0;
  y = 0;
  rot = 0;
  scaleX = 1;
  scaleY = 1;
  /** 世界矩阵（computeWorld 后有效） */
  readonly world: Mat2x3 = identityMat();

  constructor(data: BoneData) {
    this.name = data.name;
    this.applyRest(data.transform);
  }

  applyRest(t?: BoneTransformData): void {
    this.restX = t?.x ?? 0;
    this.restY = t?.y ?? 0;
    this.restRot = t?.rotate ?? 0;
    this.restScaleX = t?.scaleX ?? 1;
    this.restScaleY = t?.scaleY ?? 1;
    this.resetLocal();
  }

  resetLocal(): void {
    this.x = this.restX;
    this.y = this.restY;
    this.rot = this.restRot;
    this.scaleX = this.restScaleX;
    this.scaleY = this.restScaleY;
  }

  /** 由本地变换（含父级）复合出世界矩阵 */
  computeWorld(): void {
    const cos = Math.cos(this.rot);
    const sin = Math.sin(this.rot);
    // 本地矩阵：a=sx·cos, b=sx·sin, c=-sy·sin, d=sy·cos, tx=x, ty=y（y 向下，正旋转=顺时针）
    const la = this.scaleX * cos;
    const lb = this.scaleX * sin;
    const lc = -this.scaleY * sin;
    const ld = this.scaleY * cos;
    const p = this.parent ? this.parent.world : IDENTITY_WORLD;
    const w = this.world;
    w.a = la * p.a + lb * p.c;
    w.b = la * p.b + lb * p.d;
    w.c = lc * p.a + ld * p.c;
    w.d = lc * p.b + ld * p.d;
    w.tx = this.x * p.a + this.y * p.c + p.tx;
    w.ty = this.x * p.b + this.y * p.d + p.ty;
  }
}

const IDENTITY_WORLD: Mat2x3 = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export interface SlotPose {
  /** 世界矩阵 */
  matrix: Mat2x3;
  /** 显示索引（预留多 display） */
  displayIndex: number;
}

/** 骨架运行态：骨骼层级 + slot 绑定 */
export class Armature {
  readonly name: string;
  readonly bones: BoneState[] = [];
  readonly slots = new Map<string, SlotPose>();
  /** slot → 对应骨骼名 */
  private readonly slotBone = new Map<string, string>();

  constructor(data: ArmatureData) {
    this.name = data.name;
    // 先建骨骼（保持数据顺序），再链接父子
    const byName = new Map<string, BoneState>();
    for (const b of data.bone) {
      const bs = new BoneState(b);
      this.bones.push(bs);
      byName.set(b.name, bs);
    }
    for (const bd of data.bone) {
      const parent = bd.parent ? byName.get(bd.parent) : null;
      if (parent) byName.get(bd.name)!.parent = parent;
    }
    for (const s of data.slot) {
      this.slots.set(s.name, { matrix: identityMat(), displayIndex: s.displayIndex ?? 0 });
      this.slotBone.set(s.name, s.bone);
    }
  }

  /** 重置所有骨骼为静止姿态并计算世界矩阵 */
  resetToRest(): void {
    for (const b of this.bones) b.resetLocal();
    this.computeWorld();
  }

  /** 由当前本地变换计算全部世界矩阵，并更新 slot 姿态 */
  computeWorld(): void {
    for (const b of this.bones) b.computeWorld();
    for (const [slotName, pose] of this.slots) {
      const bone = this.slotBone.get(slotName);
      const bs = bone ? this.findBone(bone) : undefined;
      pose.matrix = bs ? bs.world : identityMat();
    }
  }

  findBone(name: string): BoneState | undefined {
    return this.bones.find((b) => b.name === name);
  }
}

/** —— 关键帧采样 —— */

interface FrameBase {
  duration: number;
  tweenEasing?: TweenEasing;
}

/** 累计帧起点，供二分查找 */
function buildFrameOffsets(frames: readonly FrameBase[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const f of frames) {
    offsets.push(acc);
    acc += f.duration;
  }
  return offsets;
}

function easeTween(t: number, easing: TweenEasing | undefined): number {
  if (easing === undefined || easing === 'line') return t;
  // DragonBones 缓动曲线：t·(t·(1-e) + e)；e=0 → t²（缓出），e 越大越接近线性
  return t * (t * (1 - easing) + easing);
}

/**
 * 定位时刻 t 所在的帧：返回帧索引与帧内缓动进度。
 * t 会被钳制到 [0, total)（>=total 一律视为末帧，避免非循环动画回绕到首帧）。
 */
function locate(
  frames: readonly FrameBase[],
  offsets: readonly number[],
  t: number,
  total: number,
): { index: number; eased: number } {
  let tt = t;
  if (total > 0 && tt >= total) tt = total - 1e-9;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= tt) lo = mid;
    else hi = mid - 1;
  }
  const index = lo;
  const frame = frames[index]!;
  const dur = frame.duration;
  const frac = dur > 0 ? clamp01((tt - offsets[index]!) / dur) : 0;
  const eased = easeTween(frac, frame.tweenEasing);
  return { index, eased };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** —— 动画播放 —— */

export interface PlayOptions {
  loop?: boolean;
  /** 与前一动作的混合时长（秒）；0 = 立即切换 */
  fadeTime?: number;
}

interface ActivePlay {
  anim: AnimationData;
  time: number;
  loop: boolean;
  weight: number;
  /** 混合方向：1 = 淡入（权重上升），-1 = 淡出，-2 = 已完成待移除 */
  fadeDir: number;
  fadeTime: number;
  /** 事件时间线已触发的帧索引（防止重复触发） */
  firedEventFrames: Map<string, number>;
}

/** 动画播放器：可同时存在 2 个活动播放（旧 + 新）做交叉混合 */
export class AnimationPlayer {
  private readonly armature: Armature;
  private readonly animations = new Map<string, AnimationData>();
  private readonly active: ActivePlay[] = [];
  private readonly pendingEvents: string[] = [];

  constructor(skeleton: SkeletonData, armatureName: string) {
    const arm = skeleton.armature.find((a) => a.name === armatureName);
    if (!arm) throw new Error(`[anim] 未找到骨架 ${armatureName}（skeleton=${skeleton.name}）`);
    this.armature = new Armature(arm);
    for (const a of arm.animation) this.animations.set(a.name, a);
    this.armature.resetToRest();
  }

  get armatureState(): Armature {
    return this.armature;
  }

  hasAnimation(name: string): boolean {
    return this.animations.has(name);
  }

  /** 切换动画（支持平滑交叉混合）。返回是否成功。 */
  play(name: string, opts: PlayOptions = {}): boolean {
    const anim = this.animations.get(name);
    if (!anim) return false;
    const fadeTime = opts.fadeTime ?? 0;

    // 已在播放同名且处于稳定状态 → 保持
    const current = this.active[0];
    if (current && current.anim.name === name && current.fadeDir === 0 && current.weight >= 1) {
      return true;
    }

    // 把现有活动播放转为淡出
    for (const p of this.active) {
      if (p.fadeDir === 0) {
        p.fadeDir = -1;
        p.fadeTime = fadeTime;
      }
    }
    const loop = opts.loop ?? anim.playTimes !== 1;
    this.active.unshift({
      anim,
      time: 0,
      loop,
      weight: fadeTime > 0 ? 0 : 1,
      fadeDir: fadeTime > 0 ? 1 : 0,
      fadeTime,
      firedEventFrames: new Map(),
    });
    return true;
  }

  /** 当前主播放的动画名（无则 null） */
  get currentName(): string | null {
    return this.active.length > 0 ? this.active[0]!.anim.name : null;
  }

  /** 查询某个动画的时长（秒）；不存在返回 0 */
  getDuration(name: string): number {
    return this.animations.get(name)?.duration ?? 0;
  }

  /** 当前主播放是否为"非循环且已播完"（用于一次性动作结束后回切） */
  get isCurrentFinished(): boolean {
    const p = this.active[0];
    if (!p) return false;
    if (p.loop) return false;
    return p.time >= p.anim.duration;
  }

  /** 推进时间并混合骨骼变换 */
  update(dt: number): void {
    this.pendingEvents.length = 0;

    // 1. 推进每个活动播放并采样
    type Sampled = {
      weight: number;
      boneX: Map<string, number>;
      boneY: Map<string, number>;
      boneRot: Map<string, number>;
      boneSX: Map<string, number>;
      boneSY: Map<string, number>;
    };
    const sampled: Sampled[] = [];
    for (const p of this.active) {
      p.time += dt;
      const anim = p.anim;
      const total = anim.duration > 0 ? anim.duration : 1;

      if (p.loop && p.time >= total) {
        p.time = p.time % total;
        // 回绕视为重新进入首帧：清空事件帧记录
        p.firedEventFrames.clear();
      } else if (!p.loop && p.time >= total) {
        p.time = total; // 停住末帧
      }

      const smp: Sampled = {
        weight: p.weight,
        boneX: new Map(),
        boneY: new Map(),
        boneRot: new Map(),
        boneSX: new Map(),
        boneSY: new Map(),
      };
      for (const tl of anim.boneTimelines ?? []) {
        const bone = this.armature.findBone(tl.bone);
        if (!bone) continue;
        if (tl.translateFrame && tl.translateFrame.length > 0) {
          const offsets = buildFrameOffsets(tl.translateFrame);
          const { index, eased } = locate(tl.translateFrame, offsets, p.time, total);
          const a = tl.translateFrame[index]!;
          const b = tl.translateFrame[(index + 1) % tl.translateFrame.length]!;
          smp.boneX.set(tl.bone, lerp(a.x, b.x, eased));
          smp.boneY.set(tl.bone, lerp(a.y, b.y, eased));
        }
        if (tl.rotateFrame && tl.rotateFrame.length > 0) {
          const offsets = buildFrameOffsets(tl.rotateFrame);
          const { index, eased } = locate(tl.rotateFrame, offsets, p.time, total);
          const a = tl.rotateFrame[index]!;
          const b = tl.rotateFrame[(index + 1) % tl.rotateFrame.length]!;
          smp.boneRot.set(tl.bone, lerpAngle(a.rotate, b.rotate, eased));
        }
        if (tl.scaleFrame && tl.scaleFrame.length > 0) {
          const offsets = buildFrameOffsets(tl.scaleFrame);
          const { index, eased } = locate(tl.scaleFrame, offsets, p.time, total);
          const a = tl.scaleFrame[index]!;
          const b = tl.scaleFrame[(index + 1) % tl.scaleFrame.length]!;
          smp.boneSX.set(tl.bone, lerp(a.scaleX, b.scaleX, eased));
          smp.boneSY.set(tl.bone, lerp(a.scaleY, b.scaleY, eased));
        }
      }
      sampled.push(smp);

      // 2. 事件时间线：进入新帧时触发该帧事件
      for (const et of anim.eventTimelines ?? []) {
        const offsets = buildFrameOffsets(et.frame);
        const { index } = locate(et.frame, offsets, p.time, total);
        const key = et.bone ?? '';
        const prev = p.firedEventFrames.get(key) ?? -1;
        if (index !== prev) {
          p.firedEventFrames.set(key, index);
          for (const ev of et.frame[index]!.events) {
            this.pendingEvents.push(ev.name);
          }
        }
      }

      // 3. 淡入淡出权重
      if (p.fadeDir !== 0 && p.fadeTime > 0) {
        p.weight += (dt / p.fadeTime) * p.fadeDir;
        if (p.weight >= 1) {
          p.weight = 1;
          p.fadeDir = 0;
        } else if (p.weight <= 0) {
          p.weight = 0;
          p.fadeDir = -2; // 标记待移除
        }
      }
    }

    // 4. 按权重混合到骨骼本地变换
    for (const bone of this.armature.bones) {
      let sx = 0;
      let sy = 0;
      let rot = 0;
      let scx = 0;
      let scy = 0;
      let wsum = 0;
      for (const s of sampled) {
        const w = s.weight;
        if (w <= 0) continue;
        const bx = s.boneX.get(bone.name);
        const by = s.boneY.get(bone.name);
        const br = s.boneRot.get(bone.name);
        const bscx = s.boneSX.get(bone.name);
        const bscy = s.boneSY.get(bone.name);
        sx += (bx ?? bone.restX) * w;
        sy += (by ?? bone.restY) * w;
        rot += (br ?? bone.restRot) * w;
        scx += (bscx ?? bone.restScaleX) * w;
        scy += (bscy ?? bone.restScaleY) * w;
        wsum += w;
      }
      if (wsum > 0) {
        bone.x = sx / wsum;
        bone.y = sy / wsum;
        bone.rot = rot / wsum;
        bone.scaleX = scx / wsum;
        bone.scaleY = scy / wsum;
      } else {
        bone.resetLocal();
      }
    }

    // 5. 世界矩阵
    this.armature.computeWorld();

    // 6. 清理已结束的播放
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i]!.fadeDir === -2) this.active.splice(i, 1);
    }
  }

  /** 取出本帧触发的动画事件（如 hit_frame），消费后清空 */
  drainEvents(): string[] {
    const out = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return out;
  }
}

// —— 局部工具（anim 只依赖自身与 types/，不引入 utils） ——
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
