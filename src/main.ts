import * as Phaser from 'phaser';
import { DemoScene } from './DemoScene';

const config = {
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#8fbf7f',
  scene: [DemoScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
