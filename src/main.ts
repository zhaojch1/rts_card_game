import * as Phaser from 'phaser';
import { DemoScene } from './DemoScene';
import { RiveSpikeScene } from './RiveSpikeScene';

// 默认打开玩法 demo（长枪兵完整动画）
// ?rive → Rive 技术验证页（封存的美术路线，可参考集成方式）
const params = new URLSearchParams(location.search);
const useRive = params.has('rive');

const config = {
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#8fbf7f',
  scene: useRive ? [RiveSpikeScene] : [DemoScene],
};

new Phaser.Game(config);
