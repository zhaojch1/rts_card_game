/**
 * 程序化烘焙（art/bake.ts）—— 矢量部件 → 纹理图集。
 *
 * 需求 7.3：矢量部件绘制后烘焙为纹理图集（一次性，运行期缓存），
 * 供 PixiJS 渲染；烘焙产物（图集 + 骨骼数据）由 art/generate.ts 产出，
 * 符合 DragonBones 数据格式，未来可由编辑器产出的图集同名替换。
 *
 * 本模块只产出"画布 + 帧矩形"这类原始烘焙数据，不接触渲染 API；
 * 转换为渲染器纹理由 render/ 层负责。
 */

export interface PartDef {
  name: string;
  w: number;
  h: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface AtlasFrame {
  name: string;
  /** 在图集内的左上角坐标（像素） */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BakedAtlas {
  /** 图集画布（单张） */
  canvas: HTMLCanvasElement;
  frames: Map<string, AtlasFrame>;
  /** 图集总尺寸 */
  width: number;
  height: number;
}

/**
 * 简单网格打包：所有部件以 (maxW×maxH + pad) 为单元顺序排布。
 * 部件数少（≤ 数十），网格打包足够；多图集优化留到阶段 5 性能专题。
 */
export function bakeAtlas(parts: readonly PartDef[], pad = 2): BakedAtlas {
  let maxW = 0;
  let maxH = 0;
  for (const p of parts) {
    maxW = Math.max(maxW, p.w);
    maxH = Math.max(maxH, p.h);
  }
  const cellW = maxW + pad * 2;
  const cellH = maxH + pad * 2;
  const cols = Math.ceil(Math.sqrt(parts.length));
  const rows = Math.ceil(parts.length / cols);
  const width = cols * cellW;
  const height = rows * cellH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[art] 无法创建图集 Canvas2D 上下文');

  const frames = new Map<string, AtlasFrame>();
  parts.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * cellW + pad;
    const oy = row * cellH + pad;
    ctx.save();
    ctx.translate(ox, oy);
    p.draw(ctx);
    ctx.restore();
    frames.set(p.name, { name: p.name, x: ox, y: oy, w: p.w, h: p.h });
  });

  return { canvas, frames, width, height };
}
