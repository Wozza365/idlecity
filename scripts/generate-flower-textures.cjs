// Generates small pixel-art flower textures (assets/flowers/*.png) to
// replace the procedurally-drawn (Graphics fillCircle) wildflowers and
// flower-bed blooms in src/objects/VergeRiver.ts.
//
// Each texture uses neutral grey/white tones so it can be recoloured at
// runtime via Phaser's setTint() with any palette.flowerColors /
// petalColors entry — petals render as a slightly darkened tint, the
// centre highlight renders as the full tint colour.
//
// Run: node scripts/generate-flower-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'flowers');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PETAL    = 0xa0a0a0; // → tinted to a slightly darkened petal colour
const SHADOW   = 0x707070; // → darker shaded underside
const HIGHLIGHT = 0xffffff; // → full tint colour (bright centre)

const SIZE = 7;
const CX = 3, CY = 3;

// 5-petal round flower
function flowerA() {
  const cv = new Canvas(SIZE, SIZE);
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const px = CX + Math.round(Math.cos(a) * 1.7);
    const py = CY + Math.round(Math.sin(a) * 1.7);
    cv.circle(px, py + 1, 1.3, SHADOW, 200);
    cv.circle(px, py, 1.3, PETAL);
  }
  cv.circle(CX, CY, 1.1, HIGHLIGHT);
  return cv;
}

// 4-petal "plus" flower
function flowerB() {
  const cv = new Canvas(SIZE, SIZE);
  const offsets = [[0, -2], [0, 2], [-2, 0], [2, 0]];
  for (const [dx, dy] of offsets) {
    cv.circle(CX + dx, CY + dy + 1, 1.5, SHADOW, 200);
    cv.circle(CX + dx, CY + dy, 1.5, PETAL);
  }
  cv.circle(CX, CY, 1.2, HIGHLIGHT);
  return cv;
}

// 6-petal daisy
function flowerC() {
  const cv = new Canvas(SIZE, SIZE);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    const px = CX + Math.round(Math.cos(a) * 2);
    const py = CY + Math.round(Math.sin(a) * 2);
    cv.circle(px, py + 1, 1, SHADOW, 180);
    cv.circle(px, py, 1, PETAL);
  }
  cv.circle(CX, CY, 1.3, HIGHLIGHT);
  return cv;
}

const outputs = [
  { name: 'flower_a', cv: flowerA() },
  { name: 'flower_b', cv: flowerB() },
  { name: 'flower_c', cv: flowerC() },
];

for (const { name, cv } of outputs) {
  const outPath = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(outPath, cv.toBuffer());
  console.log(`  wrote ${name}.png  ${cv.w}x${cv.h}`);
}
console.log(`Done. ${outputs.length} flower textures written to ${OUT_DIR}`);
