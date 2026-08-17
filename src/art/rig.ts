/**
 * 程序化装配（art/rig.ts）—— 骨骼层级与部件绑定定义。
 *
 * 每个兵种定义一套骨骼层级（根 → 骨盆 → 躯干 → 头；左右臂；左右腿；武器挂点），
 * 矢量部件绑定到骨骼（与 DragonBones "图片插槽"一致，需求 7.2）。
 *
 * 坐标系约定：骨骼局部坐标以父骨骼原点为参考，y 向下为正；
 * 部件以挂点 (0,0) 为原点绘制。rest 姿态为"持枪站立"，面向 +x。
 */

import type { BoneData, SlotData } from '../anim/dragonbones';

export interface RigDef {
  bones: BoneData[];
  slots: SlotData[];
}

/**
 * 长枪兵骨骼（阶段 2 细化：增加脚掌骨；单位总高约 56px，root 在脚下地面处）。
 * 世界像素 = 世界单位 × WORLD_SCALE（见 render/constants）。
 */
export function spearmanRig(): RigDef {
  const bones: BoneData[] = [
    { name: 'root', parent: null, transform: { x: 0, y: 0 } },
    { name: 'pelvis', parent: 'root', transform: { x: 0, y: -22 } },
    { name: 'torso', parent: 'pelvis', transform: { x: 0, y: -18 } },
    { name: 'head', parent: 'torso', transform: { x: 0, y: -18 } },
    // 左臂（画面右侧，前臂；上臂 12px）
    { name: 'arm_l', parent: 'torso', transform: { x: 7, y: -12, rotate: 0.15 } },
    { name: 'hand_l', parent: 'arm_l', transform: { x: 0, y: 12 } },
    // 右臂（画面左侧，后臂，持枪）
    { name: 'arm_r', parent: 'torso', transform: { x: -7, y: -12, rotate: -0.15 } },
    { name: 'hand_r', parent: 'arm_r', transform: { x: 0, y: 12 } },
    // 腿（大腿+小腿 22px，到地面）+ 脚掌
    { name: 'leg_l', parent: 'pelvis', transform: { x: -5, y: 0 } },
    { name: 'leg_r', parent: 'pelvis', transform: { x: 5, y: 0 } },
    { name: 'foot_l', parent: 'leg_l', transform: { x: 0, y: 22 } },
    { name: 'foot_r', parent: 'leg_r', transform: { x: 0, y: 22 } },
    // 武器挂点（右手）
    { name: 'weapon', parent: 'hand_r', transform: { x: 0, y: 0, rotate: -0.2 } },
  ];

  // displayIndex 越小越靠后（先绘制）：腿 → 脚 → 后臂 → 躯干 → 头 → 前臂 → 武器
  const slots: SlotData[] = [
    { name: 'leg_r', bone: 'leg_r', displayIndex: 0 },
    { name: 'leg_l', bone: 'leg_l', displayIndex: 1 },
    { name: 'foot_r', bone: 'foot_r', displayIndex: 2 },
    { name: 'foot_l', bone: 'foot_l', displayIndex: 3 },
    { name: 'arm_r', bone: 'arm_r', displayIndex: 4 },
    { name: 'hand_r', bone: 'hand_r', displayIndex: 5 },
    { name: 'torso', bone: 'torso', displayIndex: 6 },
    { name: 'head', bone: 'head', displayIndex: 7 },
    { name: 'arm_l', bone: 'arm_l', displayIndex: 8 },
    { name: 'hand_l', bone: 'hand_l', displayIndex: 9 },
    { name: 'weapon', bone: 'weapon', displayIndex: 10 },
  ];

  return { bones, slots };
}
