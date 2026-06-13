// Generates a small soft radial-glow star texture (assets/stars/star.png) to
// replace the procedurally-drawn (Graphics nested fillCircle) sky stars and
// shooting-star particles in src/objects/Stars.ts.
//
// Drawn in pure white with a bright core fading to a soft glow halo, so it
// can be recoloured at runtime via setTint() — cream (0xffeedd) for the
// static star field, plain white for shooting-star segments (ADD blend).
//
// Run: node scripts/generate-star-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'stars');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZE = 18;
const CENTER = (SIZE - 1) / 2;
// Core radius is the texture's reference unit — at runtime, setScale(desired
// radius / CORE_R) makes the bright core render at "desired radius" px,
// with the halo scaling proportionally (~CORE_R:GLOW_R ratio).
const CORE_R = 3;
const GLOW_R = 8;

const cv = new Canvas(SIZE, SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x - CENTER;
    const dy = y - CENTER;
    const d = Math.sqrt(dx * dx + dy * dy);
    let a;
    if (d <= CORE_R) a = 255;
    else if (d >= GLOW_R) a = 0;
    else {
      const t = (d - CORE_R) / (GLOW_R - CORE_R);
      a = Math.round(255 * Math.pow(1 - t, 2.2));
    }
    if (a > 0) cv.set(x, y, 0xffffff, a);
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'star.png'), cv.toBuffer());
console.log(`wrote star.png  ${SIZE}x${SIZE}  core r=${CORE_R}, glow r=${GLOW_R}`);
