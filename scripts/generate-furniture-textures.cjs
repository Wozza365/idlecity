// Generates small pixel-art street-furniture textures (assets/furniture/*.png)
// to replace the procedurally-drawn (Graphics fillRect) benches, lamp posts
// and bollards in src/objects/VergeRiver.ts.
//
// Mirrors src/theme/themes/ClassicTheme.ts verge palette (benchWood,
// benchMetal, bollardColor) — single-theme project, so colours are baked in.
//
// Run: node scripts/generate-furniture-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas, lighten, darken } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'furniture');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Bench (30x15, origin 0.5, 0.4) ──────────────────────────────────────
// Mirrors VergeRiver.drawBenches: backrest y0-3, seat y6-10, legs y10-15.
function drawBench() {
  const W = 30, H = 15;
  const cv = new Canvas(W, H);
  const benchWood  = 0xc8a46e;
  const benchMetal = 0x4a4a4a;
  const backrest   = 0xb08848;

  // Backrest
  cv.rect(0, 0, W, 3, backrest);
  cv.rect(0, 0, W, 1, lighten(backrest, 0.2));
  cv.rect(0, 2, W, 1, darken(backrest, 0.25));

  // Seat
  cv.rect(0, 6, W, 4, benchWood);
  cv.rect(0, 6, W, 1, lighten(benchWood, 0.2));
  cv.rect(0, 9, W, 1, darken(benchWood, 0.25));
  // Slat lines
  cv.rect(10, 6, 1, 4, darken(benchWood, 0.35), 90);
  cv.rect(19, 6, 1, 4, darken(benchWood, 0.35), 90);

  // Cast-iron legs
  for (const lx of [2, 25]) {
    cv.rect(lx, 10, 3, 5, benchMetal);
    cv.rect(lx, 10, 1, 5, lighten(benchMetal, 0.25), 160);
  }
  return cv;
}

// ── Lamp post (14x19, origin 2/14, 1.0) ─────────────────────────────────
// Mirrors VergeRiver.drawLamps: base plate y17-19, pole y0-17 (x1-3),
// arm y1-3 (x2-10), head housing y0-4 (x5-12).
function drawLamp(poleColor, headColor, baseColor) {
  const W = 14, H = 19;
  const cv = new Canvas(W, H);

  // Pole
  cv.rect(1, 0, 2, 17, poleColor);
  cv.rect(1, 0, 1, 17, lighten(poleColor, 0.2), 160);
  cv.rect(2, 0, 1, 17, darken(poleColor, 0.25), 160);

  // Arm
  cv.rect(2, 1, 8, 2, poleColor);
  cv.rect(2, 1, 8, 1, lighten(poleColor, 0.15), 140);

  // Lamp head housing
  cv.rect(5, 0, 7, 4, headColor);
  cv.rect(4, 3, 9, 1, 0x333333);
  cv.rect(6, 1, 5, 1, 0x666666);

  // Base plate
  cv.rect(0, 17, 4, 2, baseColor);
  cv.rect(0, 17, 4, 1, lighten(baseColor, 0.2), 160);
  return cv;
}

// ── Bollard (4x5, origin 0.5, 1.0) ──────────────────────────────────────
// Mirrors VergeRiver.drawBollards: cap housing y0-2, pole y2-5 (x1-3),
// lens dot at (2,0).
function drawBollard(bollardColor) {
  const W = 4, H = 5;
  const cv = new Canvas(W, H);

  // Cap housing
  cv.rect(0, 0, 4, 2, 0x1e1e1e);
  cv.rect(0, 0, 4, 1, lighten(0x1e1e1e, 0.3), 160);

  // Pole
  cv.rect(1, 2, 2, 3, bollardColor);
  cv.rect(1, 2, 1, 3, lighten(bollardColor, 0.3), 140);

  // Warm lens dot
  cv.set(2, 0, 0xfff0b0, 178);
  return cv;
}

const outputs = [
  { name: 'bench',        cv: drawBench() },
  { name: 'lamp_default', cv: drawLamp(0x555555, 0x444444, 0x3a3a3a) },
  { name: 'lamp_ornate',  cv: drawLamp(0x5c4a38, 0x6a5a40, 0x7a6a50) },
  { name: 'bollard',      cv: drawBollard(0x111111) },
];

for (const { name, cv } of outputs) {
  const outPath = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(outPath, cv.toBuffer());
  console.log(`  wrote ${name}.png  ${cv.w}x${cv.h}`);
}
console.log(`Done. ${outputs.length} furniture textures written to ${OUT_DIR}`);
