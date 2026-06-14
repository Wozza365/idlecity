import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

// `render.antialias: false` below keeps the game's small pixel-art sprites
// crisp by defaulting every texture to nearest-neighbor sampling. That same
// default makes Text objects' glyph textures (which the browser always
// anti-aliases) render with blocky, pixelated edges. Force linear filtering
// on just the text textures, and render glyphs at higher-than-CSS pixel
// density so that filtering has detail to smooth with.
const originalAddText = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const resolution = Math.min(window.devicePixelRatio || 1, 3);
  const textObj = originalAddText.call(this, x, y, text, { resolution, ...style });
  textObj.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return textObj;
};

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

// `antialias: false` also sets the canvas's CSS `image-rendering` to
// `pixelated` (Phaser's CanvasInterpolation.setCrisp). On devicePixelRatio>1
// screens the canvas backing store is smaller than its physical display
// size, so the browser has to scale it up — and `pixelated` does that scale
// with nearest-neighbor, turning even the smooth text from the patch above
// into chunky blocks. Restore the browser's default smooth upscaling; sprite
// textures stay crisp (NEAREST-filtered) within the backing store, so this
// only softens their edges by a sub-pixel amount when the canvas is scaled.
game.events.once(Phaser.Core.Events.READY, () => {
  Phaser.Display.Canvas.CanvasInterpolation.setBicubic(game.canvas);
});

// Prevent HMR from stacking multiple Phaser instances on top of each other
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
