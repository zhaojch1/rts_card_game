/**
 * 浏览器验证脚本（scripts/verify-browser.mjs）
 *
 * 用本机 Chrome/Edge（headless + SwiftShader）加载开发服务器页面，
 * 采集 console 错误、验证固定时间步长/单位移动/像素渲染，
 * 并 E2E 验证相机交互（滚轮缩放、拖拽平移、边界限制）。
 *
 * 用法：node scripts/verify-browser.mjs [url] [out.png]
 * 依赖：dev server 已在 5173 端口运行；本机装有 Chrome 或 Edge。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outPng = process.argv[3] ?? path.resolve('stage1_check.png');

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('[verify] 未找到 Chrome/Edge，请设置 CHROME_PATH');
  process.exit(1);
}

const consoleErrors = [];
let result = 'ok';

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--no-sandbox'],
});

const probe = (page) =>
  page.evaluate(() => (window.__battleScene ? window.__battleScene.debugState() : null));

/** 世界单位 → 屏幕坐标（与场景相机公式一致） */
const screenOf = (st, wx, wy) => ({
  x: (wx * 28 - st.camera.offset.x) * st.camera.scale,
  y: (wy * 28 - st.camera.offset.y) * st.camera.scale,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' || /error|uncaught|pixijs error|failed/i.test(text)) {
      consoleErrors.push(`[${msg.type()}] ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[pageerror] ${err.message.slice(0, 300)}`);
  });

  // 注：vite HMR 的 websocket 使 networkidle 永不满足，用 load 即可
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2500));

  // —— 固定时间步长 + 单位移动 ——
  const p1 = await probe(page);
  await new Promise((r) => setTimeout(r, 1500));
  const p2 = await probe(page);
  if (p1 && p2) {
    const moved = Math.abs(p2.unitPos.x - p1.unitPos.x) > 0.01;
    console.log(
      `[verify] 模拟: simTime ${p1.simTime.toFixed(2)}s → ${p2.simTime.toFixed(2)}s, ` +
        `位置 (${p1.unitPos.x.toFixed(2)}, ${p1.unitPos.y.toFixed(2)}) → (${p2.unitPos.x.toFixed(2)}, ${p2.unitPos.y.toFixed(2)}), ` +
        `步数/秒=${p2.stepsPerSec}, 动画=${p2.animState}`,
    );
    if (p2.simTime <= p1.simTime) {
      console.error('[verify] 模拟时间未推进！');
      result = 'errors';
    }
    if (!moved) {
      console.error('[verify] 单位未移动！');
      result = 'errors';
    }
  }

  // —— 相机交互 E2E ——
  const camBefore = p2?.camera;
  // 滚轮缩放（以屏幕中心为锚）
  await page.mouse.move(640, 360);
  await page.mouse.wheel({ deltaY: -240 }); // 放大
  await new Promise((r) => setTimeout(r, 400));
  const camZoomed = await probe(page);
  // 拖拽平移（向右拖 200px）
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(840, 360, { steps: 5 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const camPanned = await probe(page);

  if (camBefore && camZoomed && camPanned) {
    const z = camZoomed.camera;
    const pn = camPanned.camera;
    console.log(
      `[verify] 相机: scale ${camBefore.scale.toFixed(2)} → ${z.scale.toFixed(2)} (滚轮), ` +
        `offset (${pn.offset.x.toFixed(0)}, ${pn.offset.y.toFixed(0)})`,
    );
    if (z.scale <= camBefore.scale) {
      console.error('[verify] 滚轮放大未生效！');
      result = 'errors';
    }
    // 拖拽向右 → pan(+dx) → offset.x 减小（若已触底则不变）
    if (pn.offset.x > z.offset.x + 0.01) {
      console.error(`[verify] 拖拽平移方向错误（offset.x ${z.offset.x.toFixed(1)} → ${pn.offset.x.toFixed(1)}，应减小）！`);
      result = 'errors';
    }
    // 边界限制：offset 必须在地图范围内（地图 1680×1064 px，边距 120）
    const visW = 1280 / pn.scale;
    const visH = 720 / pn.scale;
    const minX = -120;
    const maxX = 1680 - visW + 120;
    const minY = -120;
    const maxY = 1064 - visH + 120;
    if (pn.offset.x < minX - 0.5 || pn.offset.x > maxX + 0.5 || pn.offset.y < minY - 0.5 || pn.offset.y > maxY + 0.5) {
      console.error(`[verify] 相机偏移越界! offset=(${pn.offset.x.toFixed(1)}, ${pn.offset.y.toFixed(1)}), 范围 x[${minX.toFixed(0)},${maxX.toFixed(0)}] y[${minY.toFixed(0)},${maxY.toFixed(0)}]`);
      result = 'errors';
    }
  }

  await page.screenshot({ path: outPng });

  // —— 像素检查：单位区域存在盔甲蓝调像素（缩放平移后单位仍正确绘制/贴地） ——
  const pixelCheck = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { error: 'no gl' };
    const st = window.__battleScene.debugState();
    const sx = (st.unitPos.x * 28 - st.camera.offset.x) * st.camera.scale;
    const sy = (st.unitPos.y * 28 - st.camera.offset.y) * st.camera.scale;
    const rx = 120;
    const ry = 140;
    const x0 = Math.max(0, Math.round(sx - rx));
    const y0 = Math.max(0, Math.round(sy - ry));
    const rw = Math.min(canvas.width, Math.round(sx + rx)) - x0;
    const rh = Math.min(canvas.height, Math.round(sy + ry)) - y0;
    if (rw <= 0 || rh <= 0) return { error: 'region out of bounds', sx, sy };
    const px = new Uint8Array(rw * rh * 4);
    gl.readPixels(x0, canvas.height - y0 - rh, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let bluish = 0;
    let nonBg = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (Math.abs(r - 18) + Math.abs(g - 36) + Math.abs(b - 24) > 60) nonBg++;
      if (b > r + 30 && b > 100) bluish++;
    }
    return { sx, sy, bluish, nonBg, unit: st.unitPos };
  });
  if (pixelCheck && !pixelCheck.error) {
    console.log(`[verify] 像素检查: 单位屏幕(${pixelCheck.sx.toFixed(0)}, ${pixelCheck.sy.toFixed(0)}) 非背景=${pixelCheck.nonBg} 蓝调=${pixelCheck.bluish}`);
    if (pixelCheck.bluish < 100) {
      console.error('[verify] 单位区域蓝调像素过少，单位可能未正确绘制/贴地！');
      result = 'errors';
    }
  } else {
    console.warn(`[verify] 像素检查跳过: ${pixelCheck?.error ?? 'unknown'}`);
  }

  // —— 面板统计 ——
  const stats = await page.evaluate(() => {
    const panel = document.getElementById('debug-panel');
    if (!panel) return null;
    return [...panel.querySelectorAll('.row')].map((r) =>
      r.textContent ? r.textContent.trim().replace(/\s+/g, ' ') : '',
    );
  });
  console.log('[verify] 面板统计:');
  for (const row of stats ?? []) console.log('   ' + row);

  if (consoleErrors.length > 0) {
    result = 'errors';
    console.error('[verify] console 错误:');
    for (const e of consoleErrors) console.error('   ' + e);
  } else {
    console.log('[verify] 无 console 错误');
  }
  console.log(`[verify] 截图已保存: ${outPng} (${fs.statSync(outPng).size} bytes)`);
} finally {
  await browser.close();
  try {
    spawn('taskkill', ['/F', '/IM', 'chrome.exe', '/T'], { stdio: 'ignore' });
    spawn('taskkill', ['/F', '/IM', 'msedge.exe', '/T'], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

process.exit(result === 'ok' ? 0 : 1);
