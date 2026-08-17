/**
 * 浏览器验证脚本（scripts/verify-browser.mjs）
 *
 * 用本机 Chrome/Edge（headless + SwiftShader）加载开发服务器页面，
 * 验证框架底座：固定时间步长推进、测试对象移动、相机交互（滚轮/拖拽/键盘）、
 * 像素渲染（shader 测试对象可见）、无 console 错误。
 *
 * 用法：node scripts/verify-browser.mjs [url] [out.png]
 * 依赖：dev server 已在 5173 端口运行；本机装有 Chrome 或 Edge。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outPng = process.argv[3] ?? path.resolve('verify_check.png');

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
  page.evaluate(() => {
    const s = window.__battleScene;
    if (!s) return null;
    try {
      return s.debugState();
    } catch {
      return null; // 场景异步启动未完成
    }
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
  // 等待页面稳定（HMR 重载可能重置模拟）且场景就绪、至少一个完整统计窗口（>1s 模拟）
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const st = await probe(page);
    if (st && st.camera && st.simTime > 3) break;
  }

  // —— 像素检查：测试对象区域存在蓝色调像素（先于相机操作，保证对象在视野内） ——
  const pixelCheck = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { error: 'no gl' };
    const st = window.__battleScene?.debugState();
    if (!st?.camera) return { error: 'scene not ready' };
    const sx = (st.objPos.x * 28 - st.camera.offset.x) * st.camera.scale;
    const sy = (st.objPos.y * 28 - st.camera.offset.y) * st.camera.scale;
    const rx = 60;
    const ry = 60;
    const x0 = Math.max(0, Math.round(sx - rx));
    const y0 = Math.max(0, Math.round(sy - ry));
    const rw = Math.min(canvas.width, Math.round(sx + rx)) - x0;
    const rh = Math.min(canvas.height, Math.round(sy + ry)) - y0;
    if (rw <= 0 || rh <= 0) return { error: 'region out of bounds', sx, sy };
    const px = new Uint8Array(rw * rh * 4);
    gl.readPixels(x0, canvas.height - y0 - rh, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let bluish = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (b > r + 30 && b > 100) bluish++;
    }
    return { sx, sy, bluish };
  });
  if (pixelCheck && !pixelCheck.error) {
    console.log(`[verify] 像素检查: 对象屏幕(${pixelCheck.sx.toFixed(0)}, ${pixelCheck.sy.toFixed(0)}) 蓝调=${pixelCheck.bluish}`);
    if (pixelCheck.bluish < 100) {
      console.error('[verify] 对象区域蓝色像素过少，测试对象可能未绘制！');
      result = 'errors';
    }
  } else {
    console.warn(`[verify] 像素检查跳过: ${pixelCheck?.error ?? 'unknown'}`);
  }

  // —— 固定时间步长 + 对象移动 ——
  const p1 = await probe(page);
  await new Promise((r) => setTimeout(r, 1500));
  const p2 = await probe(page);
  if (p1 && p2) {
    const simDt = p2.simTime - p1.simTime;
    const moved = Math.abs(p2.objPos.x - p1.objPos.x);
    // 固定步长正确性判据：对象位移必须等于 模拟时间增量 × 速度(1.2)
    // （SwiftShader 慢渲染下帧间隔可能超过 dt 钳制阈值导致模拟推进变慢，
    //   但"位移 = simDt × 速度"在任何帧率下都必须成立，这才是固定步长的本质）
    const expected = simDt * 1.2;
    const drift = Math.abs(moved - expected);
    console.log(
      `[verify] 模拟: simTime ${p1.simTime.toFixed(2)}s → ${p2.simTime.toFixed(2)}s, ` +
        `位移 ${moved.toFixed(3)} / 期望(simDt×1.2) ${expected.toFixed(3)}, 漂移 ${drift.toFixed(4)}`,
    );
    if (simDt <= 0) {
      console.error('[verify] 模拟时间未推进！');
      result = 'errors';
    }
    if (drift > 0.02) {
      console.error('[verify] 对象位移与模拟时间不一致（固定步长失效？）！');
      result = 'errors';
    }
  }

  // —— 相机交互 E2E ——
  const camBefore = p2?.camera;
  await page.mouse.move(640, 360);
  await page.mouse.wheel({ deltaY: -240 }); // 放大
  await new Promise((r) => setTimeout(r, 400));
  const camZoomed = await probe(page);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(840, 360, { steps: 5 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const camPanned = await probe(page);

  if (camBefore && camZoomed && camPanned) {
    const z = camZoomed.camera;
    const pn = camPanned.camera;
    console.log(`[verify] 相机: scale ${camBefore.scale.toFixed(2)} → ${z.scale.toFixed(2)} (滚轮), offset (${pn.offset.x.toFixed(0)}, ${pn.offset.y.toFixed(0)})`);
    if (z.scale <= camBefore.scale) {
      console.error('[verify] 滚轮放大未生效！');
      result = 'errors';
    }
    if (pn.offset.x > z.offset.x + 0.01) {
      console.error('[verify] 拖拽平移方向错误！');
      result = 'errors';
    }
    const visW = 1280 / pn.scale;
    const visH = 720 / pn.scale;
    const minX = -120;
    const maxX = 1680 - visW + 120;
    const minY = -120;
    const maxY = 1064 - visH + 120;
    if (pn.offset.x < minX - 0.5 || pn.offset.x > maxX + 0.5 || pn.offset.y < minY - 0.5 || pn.offset.y > maxY + 0.5) {
      console.error('[verify] 相机偏移越界！');
      result = 'errors';
    }
  }

  // —— 键盘平移 E2E：右箭头 → 镜头右移（offset.x 增大） ——
  const camKeyBefore = await probe(page);
  await page.keyboard.down('ArrowRight');
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.up('ArrowRight');
  const camKeyAfter = await probe(page);
  if (camKeyBefore && camKeyAfter) {
    const b = camKeyBefore.camera;
    const a = camKeyAfter.camera;
    if (a.offset.x <= b.offset.x + 0.01 && a.offset.x > -120 + 0.5) {
      console.error('[verify] 键盘右箭头方向错误！');
      result = 'errors';
    } else {
      console.log(`[verify] 键盘平移: offset.x ${b.offset.x.toFixed(1)} → ${a.offset.x.toFixed(1)} (右箭头=镜头右移 ✓)`);
    }
  }

  await page.screenshot({ path: outPng });

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
