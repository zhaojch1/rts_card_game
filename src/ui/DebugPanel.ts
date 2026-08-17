/**
 * 调试面板（ui/DebugPanel.ts）—— DOM 面板，暴露阶段 0 验收所需控制项：
 *  - 统计：渲染 FPS、模拟步数/秒（验证固定时间步长）、模拟时间、单位状态；
 *  - shader 特效：受击闪白 / 死亡溶解 / 描边（需求 5.3）；
 *  - 动画状态按钮：验证动画状态机与数据驱动（需求 9.1）；
 *  - 镜头缩放。
 */
import type { UnitAnimState } from '../types';

export interface DebugPanelStats {
  renderFps: number;
  simStepsPerSec: number;
  simTime: number;
  unitPos: { x: number; y: number };
  animState: UnitAnimState;
  dirX: number;
  camScale: number;
}

export interface DebugPanelHooks {
  onState(state: UnitAnimState): void;
  onFlash(v: number): void;
  onDissolve(v: number): void;
  onOutline(v: number): void;
  onOutlineEnabled(v: boolean): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
}

const STATE_LABELS: Record<UnitAnimState, string> = {
  idle: '待机',
  walk: '移动',
  turn: '转向',
  attack: '攻击',
  block: '格挡',
  hit: '受击',
  death: '死亡',
};

export class DebugPanel {
  private readonly statsEls = {} as Record<
    'renderFps' | 'simStepsPerSec' | 'simTime' | 'animState' | 'dirX' | 'camScale',
    HTMLElement
  >;
  private posEl!: HTMLElement;

  constructor(private readonly el: HTMLElement, hooks: DebugPanelHooks) {
    this.render(hooks);
  }

  private render(hooks: DebugPanelHooks): void {
    const el = this.el;
    el.innerHTML = '';

    const h3 = document.createElement('h3');
    h3.textContent = '阶段 0 · 地基调试';
    el.appendChild(h3);

    // —— 统计 ——
    const stats = document.createElement('div');
    const mkRow = (label: string): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'row';
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      row.appendChild(l);
      row.appendChild(v);
      stats.appendChild(row);
      return v;
    };
    this.statsEls.renderFps = mkRow('渲染 FPS');
    this.statsEls.simStepsPerSec = mkRow('模拟步数/秒');
    this.statsEls.simTime = mkRow('模拟时间 (s)');
    this.posEl = mkRow('单位位置 (世界)');
    this.statsEls.animState = mkRow('动画状态');
    this.statsEls.dirX = mkRow('朝向');
    this.statsEls.camScale = mkRow('镜头缩放');
    el.appendChild(stats);

    // —— shader 特效 ——
    const fx = document.createElement('div');
    fx.className = 'group';
    const fxTitle = document.createElement('div');
    fxTitle.className = 'title';
    fxTitle.textContent = 'shader 特效';
    fx.appendChild(fxTitle);

    fx.appendChild(
      this.slider('闪白强度', 0, 1, 0, 0.01, (v) => hooks.onFlash(v)),
    );
    fx.appendChild(
      this.slider('溶解进度', 0, 1, 0, 0.01, (v) => hooks.onDissolve(v)),
    );
    fx.appendChild(
      this.slider('描边宽度', 0, 6, 0, 0.1, (v) => hooks.onOutline(v)),
    );
    const cbRow = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = false;
    cb.addEventListener('change', () => hooks.onOutlineEnabled(cb.checked));
    const cbLabel = document.createElement('span');
    cbLabel.textContent = '描边开关';
    cbRow.appendChild(cbLabel);
    cbRow.appendChild(cb);
    fx.appendChild(cbRow);
    el.appendChild(fx);

    // —— 动画状态 ——
    const anim = document.createElement('div');
    anim.className = 'group';
    const animTitle = document.createElement('div');
    animTitle.className = 'title';
    animTitle.textContent = '动画状态（数据驱动）';
    anim.appendChild(animTitle);
    const btns = document.createElement('div');
    btns.className = 'btns';
    for (const state of Object.keys(STATE_LABELS) as UnitAnimState[]) {
      const b = document.createElement('button');
      b.textContent = STATE_LABELS[state];
      b.addEventListener('click', () => hooks.onState(state));
      btns.appendChild(b);
    }
    anim.appendChild(btns);
    el.appendChild(anim);

    // —— 镜头 ——
    const cam = document.createElement('div');
    cam.className = 'group';
    const camTitle = document.createElement('div');
    camTitle.className = 'title';
    camTitle.textContent = '镜头';
    cam.appendChild(camTitle);
    const camBtns = document.createElement('div');
    camBtns.className = 'btns';
    const zin = document.createElement('button');
    zin.textContent = '放大';
    zin.addEventListener('click', () => hooks.onZoomIn());
    const zout = document.createElement('button');
    zout.textContent = '缩小';
    zout.addEventListener('click', () => hooks.onZoomOut());
    const reset = document.createElement('button');
    reset.textContent = '重置单位';
    reset.addEventListener('click', () => hooks.onReset());
    camBtns.appendChild(zin);
    camBtns.appendChild(zout);
    camBtns.appendChild(reset);
    cam.appendChild(camBtns);
    el.appendChild(cam);

    // —— 说明 ——
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent =
      '固定时间步长 1/60s：模拟步数/秒 恒为 60，与刷新率无关；渲染每帧插值。' +
      '演示单位自动巡逻，每约 4.5s 自动攻击一次（命中帧触发闪白+震屏）。' +
      '滚轮缩放镜头，拖拽平移。';
    el.appendChild(note);
  }

  private slider(
    label: string,
    min: number,
    max: number,
    value: number,
    step: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => onChange(Number(input.value)));
    row.appendChild(span);
    row.appendChild(input);
    return row;
  }

  updateStats(s: DebugPanelStats): void {
    this.statsEls.renderFps.textContent = s.renderFps.toFixed(0);
    this.statsEls.simStepsPerSec.textContent = String(s.simStepsPerSec);
    this.statsEls.simTime.textContent = s.simTime.toFixed(2);
    this.posEl.textContent = `(${s.unitPos.x.toFixed(1)}, ${s.unitPos.y.toFixed(1)})`;
    this.statsEls.animState.textContent = STATE_LABELS[s.animState];
    this.statsEls.dirX.textContent = s.dirX > 0 ? '右 (+x)' : '左 (-x)';
    this.statsEls.camScale.textContent = s.camScale.toFixed(2);
  }
}
