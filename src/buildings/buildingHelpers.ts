import Phaser from 'phaser';
import { CANOPY_ORIGIN, TRUNK_ORIGIN_X, TRUNK_ORIGIN_Y } from '../objects/TreeAssets';

// Random muted blue/purple "TV glow" colour used for the flickering TV-lit
// window variant. Identical implementation was duplicated across
// Tier1House, TwoStoreyHouse, SmallApartment, LargeApartment and Townhouse.
export function randTvColor(): number {
  return ((30 + Math.floor(Math.random() * 40)) << 16) |
         ((40 + Math.floor(Math.random() * 40)) << 8)  |
          (110 + Math.floor(Math.random() * 70));
}

// Small yard bush/tree: a tinted canopy cluster over a tinted trunk, scaled
// down from the small street-tree textures (radius CANOPY_SMALL_R). Adds the
// trunk + canopy images to `container` and pushes their tint records onto
// `yardTreeImages` so the building can re-tint them for day/night cycles.
export function addYardTree(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  yardTreeImages: Array<{ img: Phaser.GameObjects.Image; baseTint: number }>,
  x: number,
  canopyY: number,
  trunkBaseY: number,
  scale: number,
  canopyTint: number,
  trunkTint: number,
): void {
  const trunk = scene.add.image(x, trunkBaseY, 'trunk_small')
    .setOrigin(TRUNK_ORIGIN_X, TRUNK_ORIGIN_Y)
    .setScale(scale)
    .setTint(trunkTint);
  const canopy = scene.add.image(x, canopyY, 'canopy_small')
    .setOrigin(CANOPY_ORIGIN, CANOPY_ORIGIN)
    .setScale(scale)
    .setTint(canopyTint);
  container.add(trunk);
  container.add(canopy);
  yardTreeImages.push({ img: trunk, baseTint: trunkTint }, { img: canopy, baseTint: canopyTint });
}
