/**
 * 浏览器验证脚本（scripts/verify-browser.mjs）
 *
 * 用本机 Chrome/Edge（headless + SwiftShader）加载开发服务器页面，
 * 采集 console 错误并截图，用于阶段验收的"画面可运行"检查。
 *
 * 用法：node scripts/verify-browser.mjs [url] [out.png]
 * 依赖：dev server 已在 5173 端口运行；本机装有 Chrome 或 Edge。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outPng = process.argv[3] ?? path.resolve('stage0_check.png');

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

  // 等待若干帧渲染（固定时间步长 + 动画）
  await new Promise((r) => setTimeout(r, 2500));

  await page.screenshot({ path: outPng });

  // 读取面板统计（验证固定时间步长与动画状态机在浏览器中真实运行）
  const stats = await page.evaluate(() => {
    const panel = document.getElementById('debug-panel');
    if (!panel) return null;
    const rows = [...panel.querySelectorAll('.row')].map((r) =>
      r.textContent ? r.textContent.trim().replace(/\s+/g, ' ') : '',
    );
    return rows;
  });
  console.log('[verify] 面板统计:');
  for (const row of stats ?? []) console.log('   ' + row);

  // 运行时探针：两次采样验证单位确实在移动（固定步长推进 + 巡逻）
  const probe1 = await page.evaluate(() =>
    (window.__battleScene ? window.__battleScene.debugState() : null),
  );
  await new Promise((r) => setTimeout(r, 1500));
  const probe2 = await page.evaluate(() =>
    (window.__battleScene ? window.__battleScene.debugState() : null),
  );
  console.log('[verify] 视图探针:', JSON.stringify(probe2?.view ?? null));
  if (probe1 && probe2) {
    const moved =
      Math.abs(probe2.unitPos.x - probe1.unitPos.x) > 0.01 ||
      Math.abs(probe2.unitPos.y - probe1.unitPos.y) > 0.01;
    console.log(`[verify] 探针: simTime ${probe1.simTime.toFixed(2)}s → ${probe2.simTime.toFixed(2)}s, ` +
      `位置 (${probe1.unitPos.x.toFixed(2)}, ${probe1.unitPos.y.toFixed(2)}) → (${probe2.unitPos.x.toFixed(2)}, ${probe2.unitPos.y.toFixed(2)}), ` +
      `移动中: ${moved}, 动画: ${probe2.animState}`);
    if (probe2.simTime <= probe1.simTime) {
      console.error('[verify] 模拟时间未推进！');
      result = 'errors';
    }
    if (!moved && probe2.animState === 'walk') {
      console.error('[verify] walk 状态但位置未移动！');
      result = 'errors';
    }
  }

  // 像素级检查：WebGL 画布中单位所在区域是否存在"盔甲蓝调"像素（证明单位已绘制）
  const pixelCheck = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return { error: 'no canvas' };
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { error: 'no gl context' };
    const w = canvas.width;
    const h = canvas.height;
    // 单位当前世界坐标（探针给出）→ 屏幕坐标：sx = (wx*28 + 456) * 1.4, sy = (wy*28 + 280) * 1.4
    const scene = window.__battleScene;
    if (!scene) return { error: 'no scene' };
    const st = scene.debugState();
    const cx = Math.round((st.unitPos.x * 28 + 456) * 1.4);
    const cy = Math.round((st.unitPos.y * 28 + 280) * 1.4);
    const rx = 100;
    const ry = 130;
    const x0 = Math.max(0, cx - rx);
    const y0 = Math.max(0, cy - ry);
    const rw = Math.min(w, cx + rx) - x0;
    const rh = Math.min(h, cy + ry) - y0;
    if (rw <= 0 || rh <= 0) return { error: 'region out of bounds' };
    const px = new Uint8Array(rw * rh * 4);
    gl.readPixels(x0, h - y0 - rh, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let bluish = 0;
    let nonBg = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (Math.abs(r - 18) + Math.abs(g - 36) + Math.abs(b - 24) > 60) nonBg++;
      if (b > r + 30 && b > 100) bluish++; // 盔甲/金属蓝调
    }
    return { x0, y0, rw, rh, bluish, nonBg, unit: st.unitPos, region: `${cx},${cy}` };
  });
  if (pixelCheck && !pixelCheck.error) {
    console.log(`[verify] 像素检查: 单位区域(${pixelCheck.region}) 非背景像素=${pixelCheck.nonBg}, 蓝调像素=${pixelCheck.bluish}`);
    if (pixelCheck.bluish < 100) {
      console.error('[verify] 单位区域蓝调像素过少，单位可能未正确绘制！');
      result = 'errors';
    }
  } else {
    console.warn(`[verify] 像素检查跳过: ${pixelCheck?.error ?? 'unknown'}`);
  }

  // ASCII 可视化：采样单位区域 40x16 个块，按颜色类别输出字符
  const ascii = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return 'no gl';
    const w = canvas.width;
    const h = canvas.height;
    const st = window.__battleScene.debugState();
    const cx = Math.round((st.unitPos.x * 28 + 456) * 1.4);
    const cy = Math.round((st.unitPos.y * 28 + 280) * 1.4);
    const cols = 44;
    const rows = 20;
    const rw = 220;
    const rh = 260;
    const x0 = cx - rw / 2;
    const y0 = cy - rh / 2;
    const px = new Uint8Array(rw * rh * 4);
    gl.readPixels(Math.max(0, x0), Math.max(0, h - y0 - rh), rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const cls = (r, g, b) => {
      if (Math.abs(r - 18) + Math.abs(g - 36) + Math.abs(b - 24) < 60) return ' '; // 背景
      if (g > r && g > b) return '.'; // 草地
      if (b > r + 25 && b > 100) return '#'; // 蓝调(盔甲)
      if (r > 200 && g > 190 && b > 190) return '+'; // 金属亮色
      if (r > 150 && g > 110 && b < 90) return 'R'; // 红/褐(盔缨/木杆)
      return 'o'; // 其他
    };
    let out = '';
    for (let ry = 0; ry < rows; ry++) {
      let line = '';
      for (let rx = 0; rx < cols; rx++) {
        const sx = Math.floor((rx / cols) * rw);
        const sy = Math.floor((ry / rows) * rh);
        const i = (sy * rw + sx) * 4;
        line += cls(px[i], px[i + 1], px[i + 2]);
      }
      out += line + '\n';
    }
    return out;
  });
  console.log('[verify] 单位区域 ASCII 地图 (中心: 单位位置):');
  console.log(ascii);

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
  // 清理可能残留的浏览器进程
  try {
    spawn('taskkill', ['/F', '/IM', 'chrome.exe', '/T'], { stdio: 'ignore' });
    spawn('taskkill', ['/F', '/IM', 'msedge.exe', '/T'], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

process.exit(result === 'ok' ? 0 : 1);
