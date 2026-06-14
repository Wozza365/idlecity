import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

// How many physical pixels to render per CSS pixel, for both the game canvas
// (see applyPixelDensity below) and Text glyph textures. Rounded to an
// integer so it lines up with `render.roundPixels` (a fractional zoom level
// would defeat pixel-perfect snapping) and capped at 3 to bound the GPU cost
// of the Light2D/shadow pipeline, which redraws every light per output pixel.
const PIXEL_DENSITY = Math.min(Math.round(window.devicePixelRatio || 1), 3);

// `render.antialias: false` below keeps the game's small pixel-art sprites
// crisp by defaulting every texture to nearest-neighbor sampling. That same
// default makes Text objects' glyph textures (which the browser always
// anti-aliases) render with blocky, pixelated edges. Force linear filtering
// on just the text textures, and render glyphs at PIXEL_DENSITY so that
// filtering has detail to smooth with — and so each glyph texel lines up
// 1:1 with a physical pixel once applyPixelDensity supersamples the canvas.
const originalAddText = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const textObj = originalAddText.call(this, x, y, text, { resolution: PIXEL_DENSITY, ...style });
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

// `Scale.RESIZE` sizes the canvas's WebGL backing store — and therefore the
// GL viewport — to the CSS display size with no devicePixelRatio scaling. On
// a DPR>1 screen the browser then has to upscale that lower-resolution
// framebuffer to fill the physical display, and that upscale is what makes
// everything — including the PIXEL_DENSITY/LINEAR-filtered text above — look
// soft or blocky, regardless of how the source textures are filtered.
//
// Supersample the framebuffer to PIXEL_DENSITY x the CSS size while leaving
// the canvas's CSS display size, and every camera/world coordinate, exactly
// as Phaser set them up: grow the backing store and GL viewport to
// `cssSize * PIXEL_DENSITY`, but keep the projection matrix mapping
// `[0, cssWidth] x [0, cssHeight]` (the camera's existing output range) to
// clip space. World units therefore continue to equal CSS pixels — so
// layout, input hit-testing, and the Light2D shadow-map pipeline (which all
// key off `scene.scale.width/height`) are unaffected — but each world unit
// now covers PIXEL_DENSITY framebuffer pixels, matching the
// PIXEL_DENSITY-resolution glyph textures above 1:1.
function applyPixelDensity(): void {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;

  const cssW = game.scale.width;
  const cssH = game.scale.height;
  const w = Math.round(cssW * PIXEL_DENSITY);
  const h = Math.round(cssH * PIXEL_DENSITY);

  const canvas = game.canvas;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  renderer.resize(w, h);

  // `resize()` — and every draw call afterwards, via
  // setProjectionMatrixFromDrawingContext — projects the new, larger
  // `[0,w]x[0,h]` backing store to clip space. Re-map the base drawing
  // context (and any same-size intermediate context the LightingComposite
  // filter renders into) back to `[0,cssW]x[0,cssH]`, so the unchanged
  // camera output fills the whole supersampled framebuffer instead of just
  // its top-left corner. Smaller, fixed-size contexts (e.g. the Light2D
  // shadow/cursor maps, sized to cssW x cssH) are left on their own
  // projection and untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = renderer as any;
  if (!r.__pixelDensityPatched) {
    r.__pixelDensityPatched = true;
    const original = r.setProjectionMatrixFromDrawingContext.bind(r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.setProjectionMatrixFromDrawingContext = (drawingContext: any): unknown => {
      if (drawingContext.width === r.width && drawingContext.height === r.height) {
        return r.setProjectionMatrix(game.scale.width, game.scale.height, false);
      }
      return original(drawingContext);
    };
  }
}

game.events.once(Phaser.Core.Events.READY, applyPixelDensity);
game.scale.on(Phaser.Scale.Events.RESIZE, () => queueMicrotask(applyPixelDensity));

// Prevent HMR from stacking multiple Phaser instances on top of each other
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
