/**
 * 调试面板（ui/DebugPanel.ts）—— DOM 面板，框架底座版本。
 *
 *  - 统计：渲染 FPS、模拟步数/秒（验证固定时间步长）、模拟时间、对象位置、镜头缩放、鼠标世界坐标；
 *  - shader 特效：闪白 / 溶解 / 描边（需求 5.3，可调参数验证特效层）；
 *  - 镜头：放大/缩小/重置。
 */
export interface DebugPanelStats {
  renderFps: number;
  simStepsPerSec: number;
  simTime: number;
  objPos: { x: number; y: number };
  camScale: number;
  mouseWorld: { x: number; y: number };
}

export interface DebugPanelHooks {
  onFlash(v: number): void;
  onDissolve(v: number): void;
  onOutline(v: number): void;
  onOutlineEnabled(v: boolean): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
}

export class DebugPanel {
  private readonly statsEls = {} as Record<
    'renderFps' | 'simStepsPerSec' | 'simTime' | 'objPos' | 'camScale' | 'mouseWorld',
    HTMLElement
  >;

  constructor(private readonly el: HTMLElement, hooks: DebugPanelHooks) {
    this.render(hooks);
  }

  private render(hooks: DebugPanelHooks): void {
    const el = this.el;
    el.innerHTML = '';

    const h3 = document.createElement('h3');
    h3.textContent = '框架底座 · 调试面板';
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
    this.statsEls.objPos = mkRow('对象位置 (世界)');
    this.statsEls.camScale = mkRow('镜头缩放');
    this.statsEls.mouseWorld = mkRow('鼠标世界坐标');
    el.appendChild(stats);

    // —— shader 特效 ——
    const fx = document.createElement('div');
    fx.className = 'group';
    const fxTitle = document.createElement('div');
    fxTitle.className = 'title';
    fxTitle.textContent = 'shader 特效';
    fx.appendChild(fxTitle);
    fx.appendChild(this.slider('闪白强度', 0, 1, 0, 0.01, (v) => hooks.onFlash(v)));
    fx.appendChild(this.slider('溶解进度', 0, 1, 0, 0.01, (v) => hooks.onDissolve(v)));
    fx.appendChild(this.slider('描边宽度', 0, 6, 0, 0.1, (v) => hooks.onOutline(v)));
    fx.appendChild(this.checkbox('描边开关', false, (v) => hooks.onOutlineEnabled(v)));
    el.appendChild(fx);

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
    reset.textContent = '重置对象';
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
      '框架底座演示：固定时间步长 1/60s（模拟步数/秒 恒为 60，与刷新率无关），' +
      '测试对象沿主路往返。滚轮缩放、拖拽/WASD 平移。' +
      '单位/兵种内容已移除，详见 README 交接说明。';
    el.appendChild(note);
  }

  private checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(span);
    row.appendChild(input);
    return row;
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
    this.statsEls.objPos.textContent = `(${s.objPos.x.toFixed(1)}, ${s.objPos.y.toFixed(1)})`;
    this.statsEls.camScale.textContent = s.camScale.toFixed(2);
    this.statsEls.mouseWorld.textContent = `(${s.mouseWorld.x.toFixed(1)}, ${s.mouseWorld.y.toFixed(1)})`;
  }
}
