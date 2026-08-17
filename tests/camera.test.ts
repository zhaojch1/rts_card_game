/**
 * 摄像机单元测试（render/camera 纯数学）
 *
 * 覆盖阶段 1 验收点 3：世界↔屏幕换算正确、缩放锚点不动、边界限制。
 */
import { describe, expect, it } from 'vitest';
import { Camera } from '../src/render/camera';

describe('Camera（世界像素空间）', () => {
  it('worldToScreen / screenToWorld 往返一致', () => {
    const cam = new Camera(1.4, { x: -121, y: 233 });
    const p = { x: 336, y: 504 };
    const s = cam.worldToScreen(p);
    const back = cam.screenToWorld(s);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('平移 dx 后世界点屏幕位置移动 dx（反向）', () => {
    const cam = new Camera(1.4, { x: 0, y: 0 });
    const p = { x: 100, y: 100 };
    const before = cam.worldToScreen(p);
    cam.pan(50, -30);
    const after = cam.worldToScreen(p);
    expect(after.x).toBeCloseTo(before.x + 50, 6);
    expect(after.y).toBeCloseTo(before.y - 30, 6);
  });

  it('以锚点缩放时锚点处的世界点屏幕位置不动', () => {
    const cam = new Camera(1.4, { x: 100, y: 50 });
    cam.setScaleRange(0.5, 3);
    const anchor = { x: 300, y: 200 };
    const worldBefore = cam.screenToWorld(anchor);
    cam.zoomBy(1.5, anchor);
    const worldAfter = cam.screenToWorld(anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    expect(cam.scale).toBeCloseTo(1.4 * 1.5, 6);
  });

  it('缩放被限制在 min/max 范围内', () => {
    const cam = new Camera(1, { x: 0, y: 0 });
    cam.setScaleRange(0.5, 3);
    cam.zoomBy(10);
    expect(cam.scale).toBe(3);
    cam.zoomBy(0.01);
    expect(cam.scale).toBe(0.5);
  });

  it('边界限制：平移不能越过地图边界（含边距）', () => {
    const cam = new Camera(1.4, { x: 0, y: 0 });
    cam.setView(1280, 720);
    // 地图 1680×1064，视野 914×514，边距 120
    cam.setBounds({ x: 0, y: 0, w: 1680, h: 1064 }, 120);
    cam.pan(99999, 0); // 向右猛拖 → 世界右移 → offset 减小 → 钳制到最小
    expect(cam.offset.x).toBeCloseTo(-120, 6);
    cam.pan(-99999, 0); // 向左猛拖 → offset 增大 → 钳制到最大
    expect(cam.offset.x).toBeCloseTo(1680 - 1280 / 1.4 + 120, 6);
  });

  it('视野大于地图时 offset 居中', () => {
    const cam = new Camera(0.5, { x: 0, y: 0 });
    cam.setView(1280, 720);
    // 地图 100×100，视野 2560×1440（远超地图）
    cam.setBounds({ x: 0, y: 0, w: 100, h: 100 }, 0);
    expect(cam.offset.x).toBeCloseTo((0 + 100 - 2560) / 2, 6);
  });
});
