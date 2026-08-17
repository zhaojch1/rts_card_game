/**
 * 打击感特效管理器（render/effects/EffectsManager.ts）—— 需求 9.2 打击感清单。
 *
 * - 伤害飘字（FloatingText）：命中处飘出伤害数字，上飘 + 减速 + 淡出（9.2.3）；
 * - 火花（Impact）：放射状短线粒子，带速度/重力/淡出（9.2.5 格挡火花、命中火花）。
 *
 * 全部在特效层（effect 层）内运行，由场景每帧驱动 update(dt)。
 */
import { Container, Graphics, Text } from 'pixi.js';

interface FloatingTextItem {
  text: Text;
  vy: number;
  life: number;
  maxLife: number;
}

interface SparkItem {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface FloatTextOptions {
  color?: string;
  fontSize?: number;
}

export class EffectsManager {
  private readonly floats: FloatingTextItem[] = [];
  private readonly sparks: SparkItem[] = [];

  constructor(private readonly layer: Container) {}

  /** 伤害飘字（世界像素坐标） */
  spawnFloatingText(text: string, x: number, y: number, opts: FloatTextOptions = {}): void {
    const t = new Text({
      text,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: opts.fontSize ?? 18,
        fill: opts.color ?? '#ffe9a8',
        fontWeight: 'bold',
        stroke: { color: '#1a1410', width: 4 },
      },
    });
    t.anchor.set(0.5, 1);
    t.position.set(x, y);
    this.layer.addChild(t);
    this.floats.push({ text: t, vy: -58, life: 0, maxLife: 0.85 });
  }

  /** 命中/格挡火花（世界像素坐标） */
  spawnImpact(x: number, y: number, color = 0xffd76a, count = 9): void {
    const g = new Graphics();
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const len = 8 + Math.random() * 9;
      const x0 = Math.cos(ang) * 3;
      const y0 = Math.sin(ang) * 3;
      g.moveTo(x0, y0).lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len).stroke({
        color,
        width: 2,
        alpha: 0.9,
      });
    }
    g.position.set(x, y);
    this.layer.addChild(g);
    this.sparks.push({
      g,
      vx: (Math.random() - 0.5) * 70,
      vy: -24 - Math.random() * 42,
      life: 0,
      maxLife: 0.3,
    });
  }

  /** 每帧推进特效（飘字/火花），自动清理过期对象 */
  update(dt: number): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!;
      f.life += dt;
      const p = f.life / f.maxLife;
      f.text.y += f.vy * dt;
      f.vy *= 1 - dt * 2.2; // 上飘减速
      f.text.alpha = 1 - p * p;
      if (p >= 1) {
        this.layer.removeChild(f.text);
        f.text.destroy();
        this.floats.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.life += dt;
      const p = s.life / s.maxLife;
      s.g.position.x += s.vx * dt;
      s.g.position.y += s.vy * dt;
      s.vy += 520 * dt; // 重力
      s.g.alpha = 1 - p;
      if (p >= 1) {
        this.layer.removeChild(s.g);
        s.g.destroy();
        this.sparks.splice(i, 1);
      }
    }
  }

  /** 清空全部特效（场景重置时调用） */
  clear(): void {
    for (const f of this.floats) {
      this.layer.removeChild(f.text);
      f.text.destroy();
    }
    for (const s of this.sparks) {
      this.layer.removeChild(s.g);
      s.g.destroy();
    }
    this.floats.length = 0;
    this.sparks.length = 0;
  }

  /** 当前活动特效数量（飘字 + 火花；供调试/验证） */
  get activeCount(): number {
    return this.floats.length + this.sparks.length;
  }
}
