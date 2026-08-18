import * as Phaser from 'phaser';
import { DemoScene } from './DemoScene';

const config = {
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#8fbf7f',
  scene: [DemoScene],
};

new Phaser.Game(config);
