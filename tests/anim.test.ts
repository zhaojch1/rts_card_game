/**
 * 程序化骨骼动画运行时单元测试（anim/dragonbones 纯逻辑，无 DOM/渲染依赖）
 *
 * 覆盖：解析 → 静止姿态 → 关键帧采样 → 循环回绕 → 事件（命中帧）→
 *      一次性动画完成 → 交叉混合 → DragonBones JSON 导出。
 */
import { describe, expect, it } from 'vitest';
import { AnimationPlayer } from '../src/anim/dragonbones';
import type { SkeletonData } from '../src/anim/dragonbones';
import { skeletonToDragonBonesJson } from '../src/anim/exportJson';

/** 最小骨架：root → pelvis → torso → head；root 带平移动画，head 带旋转动画 */
const MINI_SKELETON: SkeletonData = {
  name: 'mini',
  frameRate: 1,
  armature: [
    {
      name: 'hero',
      bone: [
        { name: 'root' },
        { name: 'pelvis', parent: 'root', transform: { y: -20 } },
        { name: 'torso', parent: 'pelvis', transform: { y: -16 } },
        { name: 'head', parent: 'torso', transform: { y: -14 } },
      ],
      slot: [
        { name: 'head_disp', bone: 'head' },
        { name: 'torso_disp', bone: 'torso' },
      ],
      animation: [
        {
          name: 'idle',
          duration: 2,
          boneTimelines: [
            { bone: 'root', translateFrame: [{ duration: 1, x: 0, y: 0 }, { duration: 1, x: 0, y: 2 }] },
            { bone: 'head', rotateFrame: [{ duration: 1, rotate: 0.1 }, { duration: 1, rotate: -0.1 }] },
          ],
        },
        {
          name: 'attack',
          duration: 0.5,
          playTimes: 1,
          boneTimelines: [
            {
              bone: 'root',
              translateFrame: [{ duration: 0.5, x: 10, y: 0 }],
            },
          ],
          eventTimelines: [
            {
              frame: [
                { duration: 0.3, events: [] },
                { duration: 0.2, events: [{ name: 'hit_frame' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('AnimationPlayer', () => {
  it('初始为静止姿态（rest pose）', () => {
    const p = new AnimationPlayer(MINI_SKELETON, 'hero');
    const head = p.armatureState.slots.get('head_disp')!;
    // head 世界 y = -(20+16+14) = -50
    expect(head.matrix.tx).toBeCloseTo(0);
    expect(head.matrix.ty).toBeCloseTo(-50);
  });

  it('idle 循环动画：骨骼随时间按关键帧运动并回绕', () => {
    const p = new AnimationPlayer(MINI_SKELETON, 'hero');
    p.play('idle', { loop: true });

    p.update(0); // t=0
    const rootY0 = p.armatureState.findBone('root')!.y;
    expect(rootY0).toBeCloseTo(0);

    p.update(1); // t=1，进入第二帧
    const rootY1 = p.armatureState.findBone('root')!.y;
    expect(rootY1).toBeGreaterThan(0);

    p.update(1); // t=2 → 回绕到 t=0
    const rootY2 = p.armatureState.findBone('root')!.y;
    expect(rootY2).toBeCloseTo(rootY0);
  });

  it('攻击动画在命中帧触发 hit_frame 事件', () => {
    const p = new AnimationPlayer(MINI_SKELETON, 'hero');
    p.play('attack', { loop: false });

    p.update(0.29);
    expect(p.drainEvents()).toEqual([]);

    p.update(0.02); // t=0.31 > 0.3，进入事件帧
    expect(p.drainEvents()).toContain('hit_frame');
  });

  it('一次性动画播完 isCurrentFinished = true', () => {
    const p = new AnimationPlayer(MINI_SKELETON, 'hero');
    p.play('attack', { loop: false });
    expect(p.isCurrentFinished).toBe(false);
    p.update(0.5);
    expect(p.isCurrentFinished).toBe(true);
  });

  it('getDuration 返回动画时长', () => {
    const p = new AnimationPlayer(MINI_SKELETON, 'hero');
    expect(p.getDuration('attack')).toBeCloseTo(0.5);
    expect(p.getDuration('不存在')).toBe(0);
  });

  it('交叉混合：切换动画后当前名为新动画，旧动画淡出', () => {
    const p = new AnimationPlayer(MINI_SKELETON, 'hero');
    p.play('idle', { loop: true });
    p.update(0.1);
    expect(p.currentName).toBe('idle');

    p.play('attack', { loop: false, fadeTime: 0.2 });
    expect(p.currentName).toBe('attack');
    p.update(0.3); // 超过 fadeTime，旧播放移除
    expect(p.currentName).toBe('attack');
  });

  it('未知动画 play 返回 false 且状态不变', () => {
    const p = new AnimationPlayer(MINI_SKELETON, 'hero');
    expect(p.play('nope')).toBe(false);
    expect(p.currentName).toBeNull();
  });
});

describe('DragonBones JSON 导出', () => {
  it('skeletonToDragonBonesJson 结构完整（bone/slot/skin/animation）', () => {
    const json = skeletonToDragonBonesJson(MINI_SKELETON) as {
      name: string;
      armature: Array<{
        bone: unknown[];
        slot: unknown[];
        skin: Array<{ slot: unknown[] }>;
        animation: unknown[];
      }>;
    };
    expect(json.name).toBe('mini');
    expect(json.armature).toHaveLength(1);
    const arm = json.armature[0]!;
    expect(arm.bone).toHaveLength(4);
    expect(arm.slot).toHaveLength(2);
    expect(arm.skin[0]!.slot).toHaveLength(2);
    expect(arm.animation).toHaveLength(2);
  });
});
