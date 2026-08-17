/**
 * 批处理封装（render/batch.ts）—— 需求 5.4 / 14。
 *
 * 当前职责：
 *  1. 把烘焙图集（BakedAtlas）转换为 Pixi 子纹理表（每个部件一张纹理）；
 *  2. 按 slot 的 displayIndex（层序）批量创建精灵 —— ArmatureView 消费。
 * 阶段 5（多单位性能专题）在此基础上扩展同纹理合批、纹理图集合并与对象池。
 */
import { Rectangle, Sprite, Texture } from 'pixi.js';
import type { RigDef } from '../art/rig';
import type { BakedAtlas } from '../art/bake';

/** 图集 → 部件名 → Pixi 子纹理 */
export function createAtlasTextures(atlas: BakedAtlas): Map<string, Texture> {
  const base = Texture.from(atlas.canvas);
  const out = new Map<string, Texture>();
  for (const frame of atlas.frames.values()) {
    out.set(
      frame.name,
      new Texture({
        source: base.source,
        frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
      }),
    );
  }
  return out;
}

/** 按 rig 的 slot 层序创建精灵（displayIndex 升序 = 先绘制 = 在下层），返回 slot 名 → 精灵 */
export function buildSlotSprites(rig: RigDef, textures: ReadonlyMap<string, Texture>): Map<string, Sprite> {
  const slots = [...rig.slots].sort((a, b) => (a.displayIndex ?? 0) - (b.displayIndex ?? 0));
  const out = new Map<string, Sprite>();
  for (const slot of slots) {
    const tex = textures.get(slot.name);
    if (!tex) continue;
    const spr = new Sprite(tex);
    spr.anchor.set(0, 0);
    out.set(slot.name, spr);
  }
  return out;
}
