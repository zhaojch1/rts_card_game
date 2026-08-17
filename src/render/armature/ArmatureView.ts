/**
 * 骨骼动画视图（render/armature/ArmatureView.ts）
 *
 * 把 anim/ 计算出的 slot 世界矩阵渲染为 Pixi 精灵（纯表现层，无游戏逻辑）。
 * 每个 slot 一个精灵，按 rig 的 displayIndex 分层；
 * 附带三个可调 shader 滤镜：受击闪白 / 描边 / 死亡溶解（需求 5.3）。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { SlotPose } from '../../anim/dragonbones';
import type { RigDef } from '../../art/rig';
import { buildSlotSprites, createAtlasTextures } from '../batch';
import { DissolveFilter, FlashFilter, OutlineFilter } from '../shaders';
import type { BakedAtlas } from '../../art/bake';

export interface ArmatureViewOptions {
  atlas: BakedAtlas;
  rig: RigDef;
  /** 初始朝向：1 = 面向 +x，-1 = 面向 -x */
  dirX?: 1 | -1;
}

export class ArmatureView {
  readonly container: Container;
  private readonly sprites = new Map<string, Sprite>();
  private readonly textures: Map<string, Texture>;

  readonly flash: FlashFilter;
  readonly outline: OutlineFilter;
  readonly dissolve: DissolveFilter;

  constructor(opts: ArmatureViewOptions) {
    this.container = new Container();
    this.textures = createAtlasTextures(opts.atlas);

    // 按 displayIndex 升序添加：displayIndex 小 = 先绘制 = 在下层
    this.sprites = buildSlotSprites(opts.rig, this.textures);
    for (const spr of this.sprites.values()) {
      this.container.addChild(spr);
    }

    const noiseSource = Texture.from(makeNoiseCanvas()).source;
    this.flash = new FlashFilter();
    this.outline = new OutlineFilter();
    this.dissolve = new DissolveFilter(noiseSource);
    // 滤镜顺序：闪白 → 溶解 → 描边（描边采样最外层效果）
    this.container.filters = [this.flash.filter, this.dissolve.filter, this.outline.filter];

    this.setFacing(opts.dirX ?? 1);
  }

  /** 应用 anim/ 层算出的 slot 世界姿态 */
  applyPose(slots: ReadonlyMap<string, SlotPose>): void {
    for (const [slotName, pose] of slots) {
      const spr = this.sprites.get(slotName);
      if (!spr) continue;
      const m = pose.matrix;
      spr.position.set(m.tx, m.ty);
      spr.rotation = Math.atan2(m.b, m.a);
      spr.scale.set(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
    }
  }

  /** 水平翻转朝向（2D 战棋用 dirX 表现左右朝向） */
  setFacing(dirX: 1 | -1): void {
    this.container.scale.x = dirX;
  }

  /** 容器位置（世界像素坐标，= 单位位置 × WORLD_SCALE） */
  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  set visible(v: boolean) {
    this.container.visible = v;
  }
}

/** 溶解噪声纹理（64×64 随机灰阶），与 utils/noise 一致的内联实现，避免依赖方向问题 */
function makeNoiseCanvas(): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(size, size);
  let s = 1337 >>> 0;
  const rand = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 256);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
