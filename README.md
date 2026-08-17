# 卡牌 RTS 战棋游戏 · 项目说明与交接文档

> 本文件是项目的**交接文档**（唯一入口）：说明项目现状、架构、运行方式、
> 已完成的成果、失败教训与待办事项。接任者请从本文档开始。
>
> 产品需求以仓库内《需求文档.md》为唯一权威（开发路线见其第 8 章垂直迭代阶段 0–7）。

---

## 1. 项目定位

网页端卡牌 RTS 战棋游戏：玩家组卡 → 部署单位 → 单位自动寻敌战斗 → 回合增长 → 胜负结算。
纯前端单机可演示，后端/云服务为后续扩展。

## 2. 技术栈（已定稿）

| 领域 | 选择 |
|---|---|
| 语言 | TypeScript（`strict: true`） |
| 构建 | Vite |
| 渲染 | **PixiJS v8**（WebGL2，Canvas 自动回退） |
| 动画 | 程序化骨骼 + DragonBones 5.5 兼容数据格式（自定义纯逻辑运行时） |
| 单位形象 | 程序化矢量（Canvas2D 烘焙为纹理图集，无外部美术资源） |
| 测试 | Vitest（sim/anim 纯逻辑可单测）+ puppeteer-core 无头浏览器 E2E |

## 3. 当前状态（交接时点）

### ✅ 已完成并验收

- **阶段 0 · 工程地基**：工程脚手架、固定时间步长主循环（`core/loop.ts`，1/60s 模拟 + 渲染插值 alpha）、`IRenderer` 渲染抽象（`render/` 是唯一接触 Pixi/WebGL 的模块）、DragonBones 兼容骨骼动画运行时（`anim/dragonbones.ts`，纯逻辑）、程序化矢量烘焙管线（`art/bake.ts`）。31 个单元测试全过，无头浏览器验证通过。
- **阶段 1 · 战场地图与镜头**：确定性程序化战场（`data/map.ts`：草地/土路/营地/水塘/树林/岩石/军旗 + 可通行判定）、分层静态渲染（`render/map/MapView.ts`）、带边界限制的相机（`render/camera.ts`：滚轮缩放/拖拽/WASD 平移/世界↔屏幕换算）。
- **框架底座演示**：`game/BattleScene.ts` 展示一个可被 shader 着色的测试对象在主路上往返——验证固定步长、相机、分层、特效层（闪白/描边/溶解三个自定义 GLSL 滤镜 + 飘字/火花特效管理器 `render/effects/EffectsManager.ts`）。

### ❌ 已移除（决策）

- **长枪兵（`art/parts/spearman.ts`、`art/rig.ts`、`art/generate.ts`、`data/spearman.ts`）全部删除**。原因与教训见 §6。框架底座完好，单位系统待按 §7 重建。

## 4. 架构

### 目录结构

```
src/
├── core/      # 主循环（固定时间步长）、时钟、资源缓存
├── render/    # 渲染抽象（唯一接触渲染 API 的模块）
│   ├── IRenderer.ts / PixiRenderer.ts   # 渲染接口与 PixiJS v8 实现
│   ├── camera.ts / layers.ts / batch.ts # 相机、分层、批处理
│   ├── shaders/                          # 自定义 GLSL 滤镜（闪白/描边/溶解）
│   ├── map/MapView.ts                    # 战场地图静态渲染
│   ├── effects/EffectsManager.ts         # 飘字/火花打击感特效
│   ├── armature/ArmatureView.ts          # 骨骼 slot 精灵渲染（通用）
│   └── ShadowView.ts                     # 贴地阴影
├── sim/       # 纯逻辑模拟（禁止 import 渲染/DOM）
│   ├── unit.ts / battle.ts / combat.ts   # 单位、战斗世界、伤害公式
│   ├── ai.ts / round.ts / spatial.ts     # AI 骨架、回合系统、空间分区
├── anim/      # 动画纯逻辑（不依赖渲染/sim）
│   ├── dragonbones.ts                    # DragonBones 兼容运行时（解析/关键帧/混合/事件）
│   ├── stateMachine.ts / events.ts       # 动画状态机、事件契约
│   └── exportJson.ts                     # 骨架/图集 → DragonBones JSON 导出
├── art/       # 程序化矢量 + 烘焙
│   ├── vector.ts                         # Canvas2D 绘制原语
│   └── bake.ts                           # 矢量部件 → 纹理图集
├── data/      # 配置（map.ts 战场地图；兵种配置待重建）
├── game/      # 场景组装（BattleScene 框架底座演示）
├── types/     # 共享契约（Vec2/UnitStats/UnitAnimState/UnitKind…）
└── ui/        # DOM 调试面板
tests/         # Vitest 单测（combat/anim/battle/loop/camera/map）
scripts/       # verify-browser.mjs（无头浏览器 E2E）
```

### 依赖方向（硬约束，违反即架构债）

```
types ← sim ← game      types ← anim ← game      types ← render ← game
```
- `sim/` 不依赖 `render/`、不依赖 DOM；`anim/` 只依赖数据与 `types/`；`render/` 只依赖接口。
- PixiJS import 只允许出现在 `src/render/**`（审计：`grep "from 'pixi.js'" src`）。

### 数据流

```
data/ 配置 → art/ 矢量部件+骨骼数据 → 烘焙为图集 → render/ 渲染
sim/ 计算逻辑状态 → 产生动画信号 → anim/ 状态机驱动骨骼 → render/ 播放
```

## 5. 运行 / 测试 / 验证

```bash
npm install
npm run dev       # 开发服务器 → http://localhost:5173/
npm test          # Vitest 单元测试（31 个）
npm run typecheck # tsc --noEmit
npm run build     # tsc + vite build
node scripts/verify-browser.mjs   # 无头浏览器 E2E（需 dev server 运行中）
```

调试面板（页面右上角）：渲染 FPS、模拟步数/秒、shader 特效滑块、镜头控制。

---

## 6. 长枪兵失败复盘（接任者必读）

> 长枪兵是首个兵种，经历两次尝试（自研绘制、外包绘制）均未达到"令人满意"。
> 最终决策：**删除全部长枪兵代码，保留框架底座**。以下分析是重建单位的路线图，避免重蹈覆辙。

### 6.1 真正的病根（按重要性排序）

1. **烘焙裁剪 Bug（最关键，已定位未修复）**：
   `art/bake.ts` 按"画布原点 (0,0)"记录部件帧矩形，但头/躯干等部件的绘制内容在**挂点上方（负 y）**，
   负 y 内容全部被裁剪——**躯干和头从未渲染过**。用户看到的"四根筷子"是字面意思：只有两条腿、
   两条手臂和枪，没有身体！外包 AI 画得再精细，也画在被裁掉的区域里。
   **修复方案已设计**：内容感知烘焙——逐部件绘制后扫描非透明像素包围盒作为帧，记录挂点偏移
   （pivot），渲染时精灵位置 = 骨骼位置 − pivot（见 `src/art/bake.ts` 头注释，尚未落地）。

2. **骨骼分段不足**：腿只有"大腿+小腿一体"一根骨骼 → 走路时膝盖永远不会弯曲，
   整腿绕髋直摆。关节弯曲只能由**多段骨骼各自旋转**产生，绘制画不出来。
   正确骨架：髋→大腿→小腿→脚（膝、踝两个关节）、肩→上臂→前臂→手（肘、腕）。

3. **静止姿态（rest pose）是"立正"**：两臂下垂、双腿站直 → 静止剪影就是火柴人。
   正确姿态：膝微弯、双脚分开、躯干前倾、右手持枪斜持、左手护胸——**先让剪影像人，再谈细节**。

4. **外包任务书方向错误**：把"关节感"当绘制问题交给外包，且禁止改骨架（`rig.ts`），
   外包只能在"立正火柴人"骨架上化妆 → 结果必然是"更花哨的筷子"。**骨架/姿态/动画是程序化骨骼的核心，
   不能外包给"只画部件"的任务**。

5. **小尺寸下细节不可见**：单位总高约 72–77px，内部高光/渐变几乎不可见，观感由**剪影**决定，
   剪影 = 骨架 + rest 姿态。

### 6.2 重建单位的原则（铁律）

1. **先修烘焙**：落地内容感知烘焙（pivot），否则任何单位都缺身体。
2. **先骨架后绘制**：骨骼分段（膝/肘）→ rest 姿态（弯曲站姿）→ 部件绘制 → 动画关键帧（关节驱动）。
3. **先剪影后细节**：用像素验证（单位区域 → ASCII 轮廓图，思路见历史 silhouette 脚本）确认"像人"，
   再打磨高光/护具等细节。
4. **动画关键帧以 rest 为中心**：关键帧是绝对变换，收招帧必须显式回到 rest 值，否则动作结束姿态与站姿脱节。
5. **小步验证**：每改一版就跑 `node scripts/verify-browser.mjs` + 剪影检查，别攒着一次看。

## 7. 交接待办清单

- [ ] **【最高优先】落地内容感知烘焙**：重写 `src/art/bake.ts`（扫描包围盒 + pivot，方案见文件头注释），
      同步更新 `render/batch.ts`（子纹理帧）与 `render/armature/ArmatureView.ts`（应用 pivot 偏移）。
- [ ] 重建首个兵种（建议按 §6.2 顺序：骨架分段 → 弯曲站姿 → 部件 → 关节驱动动画），
      数据生成器放 `art/` 新文件（原 `generate.ts` 已删，参考 `anim/exportJson.ts` 的导出工具）。
- [ ] 阶段 3：两个单位对打（接入 `sim/ai.ts` 的 `decide`：索敌/追击/攻击 + 命中帧事件驱动伤害结算；
      打击感设施已就绪：`render/effects`、hitstop 逻辑参考旧 BattleScene 的 fixedUpdate 设计）。
- [ ] 阶段 4：第二兵种（验证"新增兵种不改地基"）。
- [ ] 阶段 5：多单位（200 单位 60fps：四叉树 `sim/spatial.ts`、批处理、对象池）。
- [ ] 阶段 6：卡牌/部署/回合（`sim/round.ts` 已就位）。
- [ ] 阶段 7：UI/结算/音效/优化。

## 8. 已知问题与注意事项

- **dt 钳制**：`core/clock.ts` 将单帧 dt > 0.25s 丢弃（防卡顿跳变），极端慢渲染（如无头 SwiftShader 软件渲染）
  下模拟推进会变慢，属有意行为；真机 60fps 无影响。验证脚本用"位移 = 模拟时间增量 × 速度"判据（帧率无关）。
- **`preserveDrawingBuffer: true`**：`render/PixiRenderer.ts` 为像素级验证开启；多单位性能阶段应关闭。
- **世界空间约定**：相机工作于"世界像素"空间（= 世界单位 × `render/constants.ts` 的 `WORLD_SCALE=28`），
  骨骼局部坐标即像素，两者不要混用（历史教训：曾因混用导致单位位置/相机不一致）。
- **DragonBones 兼容性**：`anim/dragonbones.ts` 是 5.5 数据格式的子集实现，关键帧为**绝对变换**、
  rotate 为弧度（正=顺时针，y 向下）；对接真实编辑器数据时需校验坐标系与帧率语义（当前 frameRate=1、秒为单位）。

## 9. 提交历史（近端）

- 阶段 0/1 交付、长枪兵骨架/动画/打击感机制、键盘方向修复、长枪兵移除与底座收尾（本提交）。

---

*本文档由前任维护者编写，作为项目交接的完整说明。祝接任顺利。*
