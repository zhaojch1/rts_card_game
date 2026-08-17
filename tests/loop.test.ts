/**
 * 固定时间步长主循环单元测试（core/loop）
 *
 * 注入假时间源与手动帧调度器，验证：
 *  - 每 1/60s 精确执行一次模拟，与"帧率"无关（模拟步数 = 时间/步长）；
 *  - 渲染插值 alpha 来自累加器余量。
 */
import { describe, expect, it } from 'vitest';
import { FIXED_DT, Loop } from '../src/core/loop';

interface Harness {
  loop: Loop;
  advanceMs(ms: number): void;
  steps: number;
  alphas: number[];
  simTimes: number[];
}

function makeHarness(): Harness {
  const frames: FrameRequestCallback[] = [];
  let rafId = 0;
  let t = 0;
  const steps: number[] = [];
  const alphas: number[] = [];
  const simTimes: number[] = [];

  const loop = new Loop(
    {
      fixedUpdate: (dt) => {
        steps.push(dt);
      },
      render: (alpha) => {
        alphas.push(alpha);
        simTimes.push(loop.simTime);
      },
    },
    {
      raf: (cb) => {
        frames.push(cb);
        return ++rafId;
      },
      cancelRaf: () => {},
      now: () => t,
    },
  );

  return {
    loop,
    advanceMs(ms: number) {
      t += ms;
      const cb = frames.shift();
      if (cb) cb(performance.now());
    },
    get steps() {
      return steps.length;
    },
    get alphas() {
      return alphas;
    },
    get simTimes() {
      return simTimes;
    },
  };
}

describe('Loop（固定时间步长）', () => {
  it('固定步长：模拟 dt 恒为 1/60，与帧率无关', () => {
    const h = makeHarness();
    h.loop.start();

    // 首帧：clock 热身（首个 tick 返回 0，不产生步）
    h.advanceMs(0);
    expect(h.steps).toBe(0);

    // 一帧 16.6667ms → 1 步
    h.advanceMs(16.6667);
    expect(h.steps).toBe(1);

    // 一帧 100.5ms（如 10fps 低刷新）→ 6 步（100.5 / 16.6667 ≈ 6.03）
    h.advanceMs(100.5);
    expect(h.steps).toBe(7);

    // 模拟时间 = 步数 × 1/60
    expect(h.loop.simTime).toBeCloseTo(7 * FIXED_DT, 6);
    h.loop.stop();
  });

  it('渲染每帧执行一次，alpha 反映累加器余量（0 ≤ alpha < 1）', () => {
    const h = makeHarness();
    h.loop.start();

    h.advanceMs(0); // 首帧热身，余量 0
    expect(h.alphas[0]).toBeCloseTo(0);

    h.advanceMs(16.6667); // 恰好 1 步，余量 0
    expect(h.alphas[1]).toBeCloseTo(0);

    h.advanceMs(33.4); // 2 步 + 0.0667ms 余量
    expect(h.alphas[2]).toBeCloseTo(0.0667 / (FIXED_DT * 1000), 2);

    for (const a of h.alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
    h.loop.stop();
  });

  it('停止后不再执行回调', () => {
    const h = makeHarness();
    h.loop.start();
    h.advanceMs(0);
    h.advanceMs(16.6667);
    h.loop.stop();
    const before = h.steps;
    h.advanceMs(100);
    expect(h.steps).toBe(before);
  });
});
