/**
 * DragonBones 兼容数据导出（anim/exportJson.ts）—— 通用工具，兵种无关。
 *
 * 把运行时 SkeletonData / 烘焙图集转为 DragonBones 5.5 风格 JSON
 * （供校验、导出文件、未来编辑器数据同构对比）。
 * 具体兵种的骨骼/部件/动画由各兵种的数据生成器产出（未来实现）。
 */
import type { SkeletonData } from './dragonbones';
import type { BakedAtlas } from '../art/bake';

/**
 * 骨架 → DragonBones 5.5 风格 JSON（frameRate=1，duration 以秒为单位）。
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
    name: 'unit_atlas',
    imagePath: 'unit_atlas.png',
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
