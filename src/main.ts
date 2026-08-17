/**
 * 入口（src/main.ts）—— 启动阶段 0 演示场景。
 */
import { BattleScene } from './game/BattleScene';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const panelEl = document.getElementById('debug-panel');
  if (!canvas || !panelEl) {
    console.error('[boot] 缺少 #game-canvas 或 #debug-panel 元素');
    return;
  }
  const scene = new BattleScene({ canvas, panelEl });
  // 调试句柄：浏览器验证脚本 / 开发者工具可用
  (window as unknown as { __battleScene?: BattleScene }).__battleScene = scene;
  try {
    await scene.start();
  } catch (e) {
    console.error('[boot] 场景启动失败：', e);
  }
}

void bootstrap();
