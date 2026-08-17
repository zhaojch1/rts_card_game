/**
 * 程序化生成器（art/generate.ts）—— 矢量 + 骨骼 → DragonBones 兼容数据。
 *
 * 需求 3.3 / 7.3 / 13.2：
 *   矢量部件 → 烘焙为纹理图集；骨骼层级 + 关键帧动画 → DragonBones 兼容数据。
 *   未来美术到位后，用编辑器产出的图集 + 骨骼数据**同名替换**即可，运行时无改动。
 *
 * 约定：
 *   - frameRate = 1，动画帧 duration 以秒为单位（自洽约定，见 anim/dragonbones.ts）；
 *   - rotate 为弧度，正 = 顺时针（y 向下）；
 *   - 关键帧为骨骼局部绝对变换，无时间线的骨骼保持静止姿态。
 */
import type {
  AnimationData,
  ArmatureData,
  BoneData,
  BoneTimelineData,
  EventTimelineData,
  RotateFrameData,
  ScaleFrameData,
  SkeletonData,
  SlotData,
  TweenEasing,
  TranslateFrameData,
} from '../anim/dragonbones';
import { bakeAtlas, type BakedAtlas } from './bake';
import { SPEARMAN_PARTS } from './parts/spearman';
import { spearmanRig, type RigDef } from './rig';

// —— 关键帧构造辅助 ——

function tf(duration: number, x: number, y: number, tween: TweenEasing = 'line'): TranslateFrameData {
  return { duration, x, y, tweenEasing: tween };
}

function rf(duration: number, rotate: number, tween: TweenEasing = 'line'): RotateFrameData {
  return { duration, rotate, tweenEasing: tween };
}

// 缩放帧辅助（sf）暂未使用；新增缩放动画时在此添加

/** 每根骨骼的动作通道（平移/旋转/缩放） */
interface BoneAnimChannels {
  tf?: TranslateFrameData[];
  rf?: RotateFrameData[];
  sf?: ScaleFrameData[];
}

type AnimAuthor = Record<string, BoneAnimChannels>;

function boneTimeline(bone: string, ch: BoneAnimChannels): BoneTimelineData {
  const tl: BoneTimelineData = { bone };
  if (ch.tf) tl.translateFrame = ch.tf;
  if (ch.rf) tl.rotateFrame = ch.rf;
  if (ch.sf) tl.scaleFrame = ch.sf;
  return tl;
}

interface BuildAnimOptions {
  playTimes?: number;
  /** 事件：{ time, name }，time 为该时刻（秒）触发 */
  events?: { time: number; name: string }[];
}

function buildAnim(name: string, duration: number, author: AnimAuthor, opts: BuildAnimOptions = {}): AnimationData {
  const boneTimelines: BoneTimelineData[] = [];
  for (const [bone, ch] of Object.entries(author)) {
    if (!ch.tf && !ch.rf && !ch.sf) continue;
    boneTimelines.push(boneTimeline(bone, ch));
  }
  let eventTimelines: EventTimelineData[] | undefined;
  if (opts.events && opts.events.length > 0) {
    // 将 {time, name} 转为帧：第一个事件前为无事件帧，之后每段一个帧
    const frames: EventTimelineData['frame'] = [];
    const sorted = [...opts.events].sort((a, b) => a.time - b.time);
    let prev = 0;
    for (const ev of sorted) {
      const t = Math.min(Math.max(ev.time, 0), duration);
      if (t > prev) frames.push({ duration: t - prev, events: [] });
      frames.push({ duration: duration - t, events: [{ name: ev.name }] });
      prev = t;
    }
    // 事件帧之后到动画结束的时间已包含在最后一个帧里，无需额外补帧
    eventTimelines = [{ frame: frames }];
  }
  const anim: AnimationData = { name, duration, boneTimelines };
  if (opts.playTimes !== undefined) anim.playTimes = opts.playTimes;
  if (eventTimelines) anim.eventTimelines = eventTimelines;
  return anim;
}

// —— 长枪兵七动作关键帧（阶段 2：按第 9 章规范精细化） ——

/** 待机 idle：呼吸/重心微晃，持枪稳定不僵硬（9.1） */
function authorIdle(): AnimAuthor {
  return {
    root: { tf: [tf(1, 0, 0, 0.5), tf(1, 0, 1.2, 0.5)] },
    pelvis: { rf: [rf(1, 0.02, 0.5), rf(1, -0.02, 0.5)] },
    torso: { rf: [rf(1, 0.035, 0.5), rf(1, -0.035, 0.5)] },
    head: { rf: [rf(1, 0.025, 0.5), rf(1, -0.025, 0.5)] },
    weapon: { rf: [rf(1, 0.03, 0.5), rf(1, -0.03, 0.5)] },
    arm_r: { rf: [rf(1, 0.02, 0.5), rf(1, -0.02, 0.5)] },
  };
}

/** 移动 walk：步伐 + 重心起伏 + 长枪随动（9.1） */
function authorWalk(): AnimAuthor {
  return {
    root: { tf: [tf(0.5, 0, 0, 0.5), tf(0.5, 0, 2.5, 0.5)] },
    leg_l: { rf: [rf(0.5, 0.62, 0.5), rf(0.5, -0.62, 0.5)] },
    foot_l: { rf: [rf(0.5, -0.22, 0.5), rf(0.5, 0.22, 0.5)] },
    leg_r: { rf: [rf(0.5, -0.62, 0.5), rf(0.5, 0.62, 0.5)] },
    foot_r: { rf: [rf(0.5, 0.22, 0.5), rf(0.5, -0.22, 0.5)] },
    torso: { rf: [rf(0.5, -0.07, 0.5), rf(0.5, 0.07, 0.5)] },
    head: { rf: [rf(0.5, -0.04, 0.5), rf(0.5, 0.04, 0.5)] },
    arm_l: { rf: [rf(0.5, 0.45, 0.5), rf(0.5, -0.15, 0.5)] },
    arm_r: { rf: [rf(0.5, -0.42, 0.5), rf(0.5, 0.12, 0.5)] },
    weapon: { rf: [rf(0.5, 0.09, 0.5), rf(0.5, -0.09, 0.5)] },
  };
}

/** 攻击 attack：前摇（前踏蓄力）→ 命中（出枪刺击）→ 收招（收枪回位），含命中帧事件（9.1） */
function authorAttack(): AnimAuthor {
  return {
    root: { tf: [tf(0.22, -3, 0), tf(0.23, 13, 0), tf(0.3, 0, 0, 0.5)] },
    torso: { rf: [rf(0.22, 0.15), rf(0.23, -0.19), rf(0.3, 0, 0.5)] },
    head: { rf: [rf(0.22, 0.1), rf(0.23, -0.13), rf(0.3, 0, 0.5)] },
    weapon: { rf: [rf(0.22, -0.85), rf(0.23, -0.02), rf(0.3, -0.2, 0.5)] },
    arm_r: { rf: [rf(0.22, 0.55), rf(0.23, -0.1), rf(0.3, -0.15, 0.5)] },
    arm_l: { rf: [rf(0.22, 0.3), rf(0.23, 0), rf(0.3, 0.15, 0.5)] },
    leg_r: { rf: [rf(0.22, 0.3), rf(0.23, -0.35), rf(0.3, 0, 0.5)] },
    leg_l: { rf: [rf(0.22, -0.3), rf(0.23, 0.5), rf(0.3, 0, 0.5)] },
    foot_r: { rf: [rf(0.22, 0), rf(0.23, 0.25), rf(0.3, 0, 0.5)] },
    foot_l: { rf: [rf(0.22, 0), rf(0.23, -0.35), rf(0.3, 0, 0.5)] },
  };
}

/** 格挡 block：举枪横格，格挡命中时枪体受力偏移（9.1，含 block_frame 事件） */
function authorBlock(): AnimAuthor {
  return {
    weapon: { rf: [rf(0.12, -1.3), rf(0.36, -1.3), rf(0.12, -0.2, 0.5)] },
    torso: { rf: [rf(0.12, 0.12), rf(0.36, 0.12), rf(0.12, 0, 0.5)] },
    arm_r: { rf: [rf(0.12, 0.55), rf(0.36, 0.55), rf(0.12, -0.15, 0.5)] },
    arm_l: { rf: [rf(0.12, -0.35), rf(0.36, -0.35), rf(0.12, 0.15, 0.5)] },
    head: { rf: [rf(0.12, 0.08), rf(0.36, 0.08), rf(0.12, 0, 0.5)] },
    root: { tf: [tf(0.12, -1, 0), tf(0.36, -1, 0), tf(0.12, 0, 0)] },
  };
}

/** 受击 hit：身体后仰 + 短暂硬直 + 击退（9.1） */
function authorHit(): AnimAuthor {
  return {
    root: { tf: [tf(0.18, -6, 0), tf(0.27, 0, 0, 0.5)] },
    torso: { rf: [rf(0.18, 0.38), rf(0.27, 0, 0.5)] },
    head: { rf: [rf(0.18, 0.22), rf(0.27, 0, 0.5)] },
    weapon: { rf: [rf(0.18, 0.3), rf(0.27, -0.2, 0.5)] },
    arm_l: { rf: [rf(0.18, 0.4), rf(0.27, 0.15, 0.5)] },
    arm_r: { rf: [rf(0.18, -0.5), rf(0.27, -0.15, 0.5)] },
    leg_l: { rf: [rf(0.18, 0.15), rf(0.27, 0, 0.5)] },
    leg_r: { rf: [rf(0.18, -0.15), rf(0.27, 0, 0.5)] },
  };
}

/** 死亡 death：前扑倒地（绕脚底旋转）+ 溶解由渲染层完成（9.1，含 death_done 事件） */
function authorDeath(): AnimAuthor {
  return {
    root: { rf: [rf(0.9, 0.55), rf(0.5, 1.5), rf(0.1, 1.5, 0.5)], tf: [tf(0.9, 0, 2), tf(0.5, 0, 6), tf(0.1, 0, 6)] },
    torso: { rf: [rf(0.9, 0.08), rf(0.5, 0.15), rf(0.1, 0.15)] },
    head: { rf: [rf(0.9, 0.1), rf(0.5, 0.2), rf(0.1, 0.2)] },
    weapon: { rf: [rf(0.9, -0.45), rf(0.5, -0.3), rf(0.1, -0.3)] },
    arm_l: { rf: [rf(0.9, 0.5), rf(0.5, 0.85), rf(0.1, 0.85)] },
    arm_r: { rf: [rf(0.9, -0.6), rf(0.5, -0.95), rf(0.1, -0.95)] },
    leg_l: { rf: [rf(0.9, 0.15), rf(0.5, 0.35), rf(0.1, 0.35)] },
    leg_r: { rf: [rf(0.9, -0.15), rf(0.5, -0.35), rf(0.1, -0.35)] },
  };
}

/** 转向 turn：朝向平滑由渲染翻转 + 重心微调表现（9.1） */
function authorTurn(): AnimAuthor {
  return {
    root: { tf: [tf(0.1, 0, 0), tf(0.15, 0, 1.5, 0.5)] },
    torso: { rf: [rf(0.1, 0.06), rf(0.15, -0.06, 0.5)] },
    head: { rf: [rf(0.1, 0.04), rf(0.15, -0.04, 0.5)] },
  };
}

// —— 数据组装 ——

function buildSkeletonData(rig: RigDef, animations: AnimationData[]): SkeletonData {
  const armature: ArmatureData = {
    name: 'spearman',
    bone: rig.bones as BoneData[],
    slot: rig.slots as SlotData[],
    animation: animations,
  };
  return { name: 'spearman_skeleton', frameRate: 1, armature: [armature] };
}

/** 长枪兵完整资产：骨架数据 + 图集 + DragonBones 兼容 JSON */
export interface GeneratedSpearman {
  skeleton: SkeletonData;
  skeletonJson: string;
  atlas: BakedAtlas;
  atlasJson: string;
  rig: RigDef;
}

export function generateSpearmanAssets(): GeneratedSpearman {
  const rig = spearmanRig();
  const atlas = bakeAtlas(SPEARMAN_PARTS);
  const animations: AnimationData[] = [
    buildAnim('idle', 2.0, authorIdle()),
    buildAnim('walk', 1.0, authorWalk()),
    buildAnim('attack', 0.7, authorAttack(), { playTimes: 1, events: [{ time: 0.42, name: 'hit_frame' }] }),
    buildAnim('block', 0.5, authorBlock(), { playTimes: 1 }),
    buildAnim('hit', 0.4, authorHit(), { playTimes: 1 }),
    buildAnim('death', 1.5, authorDeath(), { playTimes: 1, events: [{ time: 1.4, name: 'death_done' }] }),
    buildAnim('turn', 0.2, authorTurn(), { playTimes: 1 }),
  ];
  const skeleton = buildSkeletonData(rig, animations);
  return {
    skeleton,
    skeletonJson: JSON.stringify(skeletonToDragonBonesJson(skeleton), null, 2),
    atlas,
    atlasJson: JSON.stringify(atlasToDragonBonesJson(atlas), null, 2),
    rig,
  };
}

// —— DragonBones 兼容 JSON 导出 ——

/**
 * 转为 DragonBones 5.5 风格 JSON（供校验/导出文件）。
 * 语义与运行时 SkeletonData 一致（frameRate=1，秒为单位）。
 */
export function skeletonToDragonBonesJson(s: SkeletonData): unknown {
  return {
    name: s.name,
    version: '5.5',
    frameRate: s.frameRate ?? 1,
    armature: s.armature.map((a) => ({
      type: 'Armature',
      frameRate: s.frameRate ?? 1,
      name: a.name,
      bone: a.bone.map((b) => ({
        name: b.name,
        ...(b.parent ? { parent: b.parent } : {}),
        transform: {
          x: b.transform?.x ?? 0,
          y: b.transform?.y ?? 0,
          ...(b.transform?.rotate ? { rotate: b.transform.rotate } : {}),
          ...(b.transform?.skew ? { skew: b.transform.skew } : {}),
          ...(b.transform?.scaleX ? { scaleX: b.transform.scaleX } : {}),
          ...(b.transform?.scaleY ? { scaleY: b.transform.scaleY } : {}),
        },
      })),
      slot: a.slot.map((sl) => ({
        name: sl.name,
        bone: sl.bone,
        ...(sl.displayIndex ? { displayIndex: sl.displayIndex } : {}),
      })),
      skin: [
        {
          name: '',
          slot: a.slot.map((sl) => ({
            name: sl.name,
            display: [{ name: sl.name, type: 'image', path: `${sl.name}.png` }],
          })),
        },
      ],
      animation: a.animation.map((an) => ({
        name: an.name,
        duration: an.duration,
        playTimes: an.playTimes ?? -1,
        boneTimelines: (an.boneTimelines ?? []).map((tl) => {
          const out: Record<string, unknown> = { bone: tl.bone };
          if (tl.translateFrame) out.translateFrame = tl.translateFrame;
          if (tl.rotateFrame) out.rotateFrame = tl.rotateFrame;
          if (tl.scaleFrame) out.scaleFrame = tl.scaleFrame;
          return out;
        }),
        ...(an.eventTimelines ? { eventTimelines: an.eventTimelines } : {}),
      })),
    })),
  };
}

/** 图集 → DragonBones textureAtlas JSON */
export function atlasToDragonBonesJson(atlas: BakedAtlas): unknown {
  return {
    name: 'spearman_atlas',
    imagePath: 'spearman_atlas.png',
    width: atlas.width,
    height: atlas.height,
    SubTexture: [...atlas.frames.values()].map((f) => ({
      name: f.name,
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
      frameX: 0,
      frameY: 0,
      frameWidth: f.w,
      frameHeight: f.h,
    })),
  };
}
