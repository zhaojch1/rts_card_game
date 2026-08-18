# RTS 卡牌游戏 · Phaser 4 引擎原型

> 本文档是给**接手开发的 AI / 开发者**的完整交接说明，重点讲清楚两件事：
> **长枪兵是怎么用代码画出来的**、**动作系统是怎么工作的**。

## 一、项目概况

- **目标**：基于 Phaser 4 的卡牌驱动 RTS 游戏（皇室战争类：出牌召唤单位，自动战斗）
- **当前进度**：已完成第一个完整单位「暗影长枪兵」——纯代码绘制的立绘 + 完整动画系统（待机 / 行走 / 攻击 / 受击 / 死亡），以及可交互的玩法 demo
- **技术栈**：Vite 6 + TypeScript + Phaser 4.0.0
- **美术策略**：全部用代码绘制（曾尝试 AI 出图，一致性差，已废弃并清理）

## 二、快速开始

```bash
npm install
npm run dev      # 打开 http://localhost:5173（玩法 demo）
npm run build    # 类型检查 + 生产构建
```

页面参数：
| 参数 | 作用 |
|---|---|
| （无） | 玩法 demo（长枪兵完整动画） |
| `?auto` | demo 自动演示（自动攻击 + 自动处决） |

## 三、目录结构

```
src/
├── main.ts              # 入口：Phaser 配置
├── DemoScene.ts         # ★ 玩法 demo：单位逻辑 + 动画状态机
└── art/
    └── spearman.ts      # ★ 核心渲染模块：长枪兵 + 史莱姆的代码绘制
```

**核心依赖关系**：`main.ts` → `DemoScene.ts` → `art/spearman.ts`（渲染层完全独立，不依赖场景）。

---

## 四、核心：长枪兵是如何渲染的（src/art/spearman.ts）

### 4.1 坐标系约定（最重要）

- 每个单位的 `Graphics` 对象锚在**脚底点**，局部坐标 `(0,0) = 脚底`，绘制方向**向上 = y 为负**
- 世界坐标：`gfx.setPosition(pos.x, pos.y)`，局部 `(0,0)` 即脚底世界位置
- 身体尺寸参考：躯干中心 `(0, -30)`、头中心 `(0, -63)`、手 `(9, -28)`、枪全长 172px、枪尖最高可到 y ≈ -190

### 4.2 画布变换（整个动画系统的地基）

`Graphics` 支持画布变换栈，`drawSpearman` 用它实现**镜像、弹跳、旋转**：

```ts
g.save();
g.translateCanvas(xShift, bob);   // 水平位移（突进/击退）+ 竖直弹跳
g.scaleCanvas(flip, 1);           // 朝向镜像（flip = 1 朝右，-1 朝左）
g.rotateCanvas(rot);              // 整体旋转，绕脚底点 → 攻击前倾 / 死亡倒下
// …… 在此变换内绘制全部身体部件（都按"朝右"的局部坐标写）……
g.restore();
```

要点：
- **朝向翻转不用逐点镜像坐标**，`scaleCanvas(flip,1)` 一行搞定，绘制代码永远按"朝右"写
- **死亡倒下 = `rotateCanvas` 从 0 转到 -1.28 弧度**（绕脚底旋转，像树倒下），整幅画（含长枪）一起转
- 地面阴影画在变换**外面**（不跟着旋转/镜像）
- 受击闪白 = 所有颜色向白色插值（`mix()` 函数）

### 4.3 绘制顺序与调色板

```
地面阴影 → 腿 → 躯干(椭圆+胸腹凸起+高光+腰带) → 披风(上窄下宽梯形) → 前护肩
→ 大头(圆形+描边) → 头盔(兜帽全遮面) → 发光单眼 → 手臂 → 长枪(黑色杆+菱形枪头) → 手
```

| 颜色 | 值 | 用途 |
|---|---|---|
| 铠甲主体 | `0x1f232a` | 躯干 |
| 铠甲高光 | `0x2a2f38` | 胸甲前侧 |
| 描边 | `0x0a0c10` | 轮廓线 |
| 头盔/兜帽 | `0x14171d` | 头部遮盖 |
| 披风 | `0x10141a` / `0x1e232b` | 深色双层 |
| 枪杆 | `0x14171c`（黑） | 长枪 |
| 枪头 | `0xd0d6de`（银）+ 暗色描边层 | 菱形 |
| 眼 | `0x3fe0c0`（青，可配） | 发光单眼 |

### 4.4 两个核心接口

```ts
// 外观配置：决定"长什么样"
interface SpearmanConfig {
  bodyW: number; bodyH: number; headR: number;
  helmet: 'crest' | 'horn' | 'plume' | 'visor' | 'hood';
  cape: 'long' | 'short' | 'ragged' | 'draped';
  accent: number;          // 眼睛/装饰色
  fullHood?: boolean;      // 兜帽全遮面，只留一只眼
  spearLen?: number;       // 枪长，默认 172
}

// 动画参数：决定"怎么动"（每帧传入）
interface SpearmanAnim {
  flip?: 1 | -1;      // 朝向
  bob?: number;        // 竖直弹跳
  rot?: number;        // 整体旋转（弧度）
  xShift?: number;     // 水平位移
  legSwing?: number;   // 腿摆动（|值|>0.12 时画两条腿一前一后，否则一条腿）
  legLift?: number;    // 抬腿
  spearLean?: number;  // 枪前倾角（弧度，0=竖直，~1.5=放平）
  spearExtend?: number;// 枪伸长
  grip?: number;       // ★ 手到枪尾距离：回缩变大、刺出变小（滑枪）
  capeSway?: number;   // 披风下摆摆动
  flash?: number;      // 受击闪白 0..1
  eyeGlow?: number;    // 眼睛发光强度
}

export const SPEARMAN_FINAL: SpearmanConfig = { bodyW: 18, bodyH: 48, headR: 16,
  helmet: 'hood', cape: 'draped', accent: 0x3fe0c0, fullHood: true, spearLen: 172 };
```

史莱姆（靶子）：`drawSlime(g, { squash, stretch, flash, alpha })`，受击挤压、死亡压扁。

---

## 五、核心：动作系统（src/DemoScene.ts）

### 5.1 两层状态机

```ts
// 视觉层：决定播放哪套动作曲线
anim.mode: 'idle' | 'walk' | 'hurt' | 'die'

// 战斗层：决定战斗姿态（只对长枪兵生效）
combat.phase: 'none' | 'level' | 'stab' | 'recover'
```

**状态机流转**：`walk`（移动中）↔ `idle`（停下）→ 受击进 `hurt`（0.28s 后回）→ 死亡进 `die`（播完删除）。
战斗层：`orderAttack()` 进入 `level` → `stab` 循环 → 脱离战斗（右键打断/目标全灭）进 `recover` → `none`。

### 5.2 各动作的参数曲线

| 动作 | 参数曲线 |
|---|---|
| **idle** | `bob = sin(t*2.2)*0.9` 呼吸、`rot = sin(t*1.6)*0.015`、`eyeGlow = 1+0.15*sin(t*3)` 光晕 |
| **walk** | `bob = -abs(sin(p))*3.5` 弹跳、`rot = sin(p)*0.05`、`legSwing = sin(p)`（两条腿一前一后）、`capeSway = sin(p)*2.5` |
| **attack** | 见下方战斗算法 |
| **hurt** | `rot = -0.09*(1-t/0.28)` 后仰、`xShift = -4*(1-t/0.28)` 击退、闪白 |
| **die** | 闪白后仰(0.15s) → `rot` 转到 -1.28 倒下(0.55s) → 着地微弹(0.15s)+尘土 → 淡出(0.45s) |

### 5.3 战斗算法（本项目的核心难点，已解决）

**原则：攻击距离由枪尖的几何位置决定，不是拍脑袋的常数。**

```
放平枪 level (0.28s)：枪从竖直(lean 0.17)压向瞄准角
突刺循环 stab（每周期 0.42s）：
  0~0.18s 回缩：grip 30→50（枪尾后探、枪尖回收），身体微退 xShift -3
  0.18~0.33s 刺出：grip 50→14（枪向前滑出），身体前冲 xShift +9，眼睛骤亮
  0.28s    伤害结算（此刻 grip=26，枪尖长度恰好 146px）
  0.33~0.42s 停顿保持
收枪 recover (0.65s)：枪慢慢收回竖直位（记录 lastLean 插值回去）
```

**枪尖瞄准算法（两个关键函数）**：

```ts
// 1) 距离控制：以"手→目标中心"为基准
//    理想值 = 枪尖刺出长度(146) − 刺入深度(8) = 138px
//    太远(>144)前进，太近(<132)后退（面向目标倒着走，速度×0.7），中间才刺
keepRange(u, t, dt)

// 2) 瞄准：每帧由"手→目标中心"方向实时求枪的前倾角
//    目标矮 → 压枪向下；目标高 → 抬枪。枪尖永远指向目标中心
spearAimLean(u, t) = Clamp(atan2(dx/d, -dy/d), 0.2, 1.7)
```

**换新单位时**：近战武器只要定义"握持点 + 武器长度"，距离控制和瞄准自动生效。

### 5.4 可调参数表（都在 DemoScene.ts 顶部）

| 常量 | 现值 | 含义 |
|---|---|---|
| `LEVEL_TIME` | 0.28s | 放平枪耗时 |
| `STAB_CYCLE` | 0.42s | 刺击周期（越大越慢） |
| `STAB_HIT_AT` | 0.28s | 伤害结算时刻（grip=26） |
| `RECOVER_TIME` | 0.65s | 收枪复位耗时（慢） |
| `GRIP_REST/RETRACT/STAB` | 30/50/14 | 握枪位（滑枪幅度） |
| `TIP_LEN_AT_HIT` | 146 | 由 `SPEAR_LEN-26` 推导 |
| `PENETRATION` | 8px | 枪尖刺入目标深度 |
| `AIM_BAND` | ±6px | 距离容差带 |
| `SPEAR_LEN` | 172 | 枪长（改它，距离算法自动跟着变） |

## 六、交互操作

| 操作 | 效果 |
|---|---|
| 左键 | 选中单位（**显示血条**，默认隐藏；绿圈已废弃） |
| 右键 | 选中单位移动到点击处（打断战斗，缓慢收枪） |
| A | 长枪兵进入战斗（放平枪→保持距离→反复刺击→收枪） |
| K | 处决选中单位（预览死亡动画） |

## 七、如何加一个新单位（给接手者的指引）

1. 在 `src/art/` 里加 `drawXxx(g, config, anim)`，复用同样的画布变换 + 动画参数接口
2. 在 `DemoScene` 的 `spawnUnit()`（属性）、`drawUnit()`（渲染分支）、`targetCenterOffset()`（目标高度）接入
3. 动画状态机是**通用的**——新单位直接复用 `anim.mode` + `combat.phase` 框架
4. 近战武器：定义握持点和武器长度即可，**距离控制/瞄准自动生效**（见 5.3）
5. 单位属性走数据驱动（HP/速度/伤害/攻击间隔/武器参数应提取为配置，这是下一步要做的"内核"）

## 八、踩坑与经验（重要，避免重复踩）

1. **Phaser 4 没有默认导出**：必须 `import * as Phaser from 'phaser'`（v3 的 `import Phaser from 'phaser'` 会构建失败）
2. **Graphics 没有 `quadraticCurveTo`**；`fillPoints`/`strokeEllipse`/`fillRoundedRect` 等都在
3. **画布变换**（`save/translateCanvas/scaleCanvas/rotateCanvas/restore`）是"整幅画旋转/镜像"的唯一干净方案，别逐点算坐标
4. **攻击距离 = 武器几何**：单位交战距离必须由"枪尖实际位置"推导，否则出现"贴脸戳空气"的假动作

## 九、下一步（主线）

1. **游戏内核**（纯 TS，不依赖 Phaser）：卡牌/能量/手牌系统、战场（双路+塔）、单位数据配置化、简单 AI
2. 把长枪兵作为第一张牌接入内核
3. 内核与渲染层解耦（渲染订阅内核状态），为联机留接口
