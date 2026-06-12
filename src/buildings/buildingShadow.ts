import Phaser from 'phaser';

// Subtle silhouette "drop shadow" along the outer edge of a building, including
// any level-up features (lamps, flags, cornices, antennas, etc.) that extend
// past the plot's [x, x + plotWidth] span. Buildings are almost entirely drawn
// with Graphics, whose bounds Container.getBounds() can't compute, so instead we
// snapshot a generous fixed-size strip of the world into a DynamicTexture, then
// redraw that snapshot as a solid-black, low-alpha silhouette offset slightly
// down-right — the same "shape shadow" technique used for pedestrians.
const H_PAD          = 16;  // covers the worst-case ~11px overhang (street lamps)
const SHADOW_ALPHA   = 0.15;
const SHADOW_OFFSET_X = 2;
const SHADOW_OFFSET_Y = 2;

let shadowSeq = 0;

export function attachBuildingShadow(
  scene: Phaser.Scene,
  building: Phaser.GameObjects.Container,
  x: number,
  plotWidth: number,
  groundY: number,
): void {
  const texW = Math.ceil(plotWidth + H_PAD * 2);
  const texH = Math.ceil(groundY);
  const key  = `bshadow-${shadowSeq++}`;

  const tex = scene.textures.addDynamicTexture(key, texW, texH);
  if (!tex) return;

  tex.draw(building, H_PAD - x, 0);
  tex.render();

  const shadow = scene.add.image(x - H_PAD + SHADOW_OFFSET_X, SHADOW_OFFSET_Y, key)
    .setOrigin(0, 0)
    .setTint(0x000000)
    .setTintMode(Phaser.TintModes.FILL)
    .setAlpha(SHADOW_ALPHA)
    .setDepth(8.95);

  building.on(Phaser.GameObjects.Events.DESTROY, () => {
    shadow.destroy();
    scene.textures.remove(key);
  });
}
