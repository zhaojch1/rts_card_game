/**
 * 豆包/火山方舟 文生图脚本
 * 用法: node scripts/gen-art.mjs <单位名> [生成张数]
 * 单位定义见下方 UNITS（角色卡），提示词七段自动组装，风格后缀全局固定保证一致性。
 * 图片保存到 assets/raw/<单位>/，按实际格式（PNG/JPEG）自动选扩展名。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 读取 .env ----------
function loadEnv() {
  const env = {};
  try {
    const txt = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env 不存在时忽略 */
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.ARK_API_KEY;
const MODEL = env.ARK_MODEL;
const UNIT = process.argv[2];
const COUNT = Math.max(1, Math.min(8, parseInt(process.argv[3] || '1', 10) || 1));

// ---------- 固定风格后缀（全游戏统一，勿改） ----------
const STYLE_SUFFIX =
  '卡通渲染风格，圆润Q版角色，粗黑描边，高饱和配色，手机卡牌游戏立绘质感，正面平视视角，全身完整入画，居中构图，角色占画面高度90%，均匀正面光无阴影，干净简洁，高清游戏素材';

// 负面提示词（模型支持时生效）
const NEGATIVE =
  '日落，战场背景，风景，背影，侧面，仰视，俯视，动态姿势，动作模糊，多角色，文字，水印，签名，边框，模糊，噪点，写实照片，剪影，透视变形，武器指向镜头，脚部出画，裁剪';

// ---------- 角色卡（新增单位在这里加） ----------
const UNITS = {
  spearman: {
    role: 'Q版二头身卡通长枪兵，圆头圆肚皮短四肢：头戴深蓝色圆顶头盔，穿蓝色布甲上衣配深蓝腰带，浅灰色裤子，棕色短靴',
    pose: '双手握一杆长枪（深棕色木杆、银色菱形枪头），枪身斜持于身体右侧；正面站立面朝镜头，双腿分开与肩同宽，站姿稳定',
    out: 'assets/raw/spearman',
  },
};

async function main() {
  if (!API_KEY) {
    console.error('缺少 ARK_API_KEY（检查 .env）');
    process.exit(1);
  }
  if (!MODEL) {
    console.error('缺少 ARK_MODEL（检查 .env）');
    process.exit(1);
  }
  const unit = UNITS[UNIT];
  if (!unit) {
    console.error('未知单位:', UNIT, '| 可选:', Object.keys(UNITS).join(', '));
    process.exit(1);
  }

  const prompt = `${unit.role}；${unit.pose}；纯白色背景，无地面无阴影；均匀正面光；${STYLE_SUFFIX}`;
  console.log('模型:', MODEL);
  console.log('单位:', UNIT, '| 张数:', COUNT);
  console.log('提示词:', prompt);

  mkdirSync(resolve(ROOT, unit.out), { recursive: true });

  // Seedream 一次只出一张，循环 COUNT 次凑候选，每次随机 seed 增加差异
  let saved = 0;
  for (let i = 1; i <= COUNT; i++) {
    console.log(`\n--- 第 ${i}/${COUNT} 张 ---`);
    const seed = Math.floor(Math.random() * 2 ** 31);
    const res = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        negative_prompt: NEGATIVE,
        size: '1024x1024',
        response_format: 'b64_json',
        watermark: false,
        seed,
      }),
      signal: AbortSignal.timeout(180000),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('API 错误 HTTP', res.status);
      console.error(text.slice(0, 2000));
      process.exit(1);
    }

    const json = JSON.parse(text);
    const item = (json.data || [])[0];
    if (!item) {
      console.error('返回中没有图片数据:', text.slice(0, 500));
      process.exit(1);
    }

    let buf;
    if (item.b64_json) {
      buf = Buffer.from(item.b64_json, 'base64');
    } else {
      const r = await fetch(item.url);
      buf = Buffer.from(await r.arrayBuffer());
    }
    // 按魔数识别真实格式（Seedream 返回的可能是 JPEG）
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const ext = isPng ? 'png' : 'jpg';
    const file = resolve(ROOT, unit.out, `${UNIT}-${i}.${ext}`);
    writeFileSync(file, buf);
    saved++;
    console.log(`✅ ${file} (${buf.length} bytes, ${isPng ? 'PNG' : 'JPEG'})`);
  }
  console.log(`\n全部完成：${saved} 张 → ${unit.out}/`);
}

main().catch((e) => {
  console.error('执行失败:', e);
  process.exit(1);
});
