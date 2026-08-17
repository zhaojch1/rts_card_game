/**
 * 通用工具（utils/）
 */

/**
 * 简易噪声画布：用于死亡溶解 shader 的噪声纹理。
 * 生成 size×size 的灰度噪声（值域 0..255），采样时平铺。
 */
export function createNoiseCanvas(size = 64, seed = 1337): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(size, size);
  let s = seed >>> 0;
  const rand = (): number => {
    // xorshift32
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
