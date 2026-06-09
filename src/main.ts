import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#0d0d1a',
  parent: 'game',
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    clearBeforeRender: true,
    antialias: false,
    roundPixels: true,
    maxLights: 150,
  },
};

const game = new Phaser.Game(config);

// Prevent HMR from stacking multiple Phaser instances on top of each other
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
