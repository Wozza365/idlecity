// Generates a small pigeon sprite sheet (assets/pigeons/pigeon.png) to
// replace the procedurally-drawn (Graphics ellipses/triangles/rects) verge
// pigeons in src/objects/PigeonManager.ts.
//
// 6 frames of 16x16, laid out horizontally, drawn facing right (flip via
// setFlipX for the opposite facing). Colours are baked in full (not dimmed)
// — night darkening is applied at runtime via setTint(lerpColor(0xffffff,
// NIGHT_TINT, nightFactor)), matching the pattern used for cyclists/boats.
//
// Frame 0: idle (standing)
// Frame 1: peck (head dipped)
// Frame 2: walk A (left leg planted, right leg lifted)
// Frame 3: walk B (right leg planted, left leg lifted)
// Frame 4: flee A (small wing spread)
// Frame 5: flee B (large wing spread)
//
// Run: node scripts/generate-pigeon-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'pigeons');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BODY_COLOR = 0x9aa3ad;
const WING_COLOR = 0x7b8492;
const HEAD_COLOR = 0xb8bec8;
const NECK_COLOR = 0x4a7a6a;
const BEAK_COLOR = 0xd99a3c;
const LEG_COLOR  = 0xc9703f;
const EYE_COLOR  = 0x1a1a1a;

const PIGEON_W = 7;
const PIGEON_H = 6;

const FRAME = 16;
const CX = 8;        // local x of the pigeon's centreline (matches origin)
const BODY_TOP = 7;  // local y of the body's top edge
const TAIL_X = CX - PIGEON_W * 0.45;

function drawPigeon(cv, { headDrop = 0, wingSpread = 0, legs }) {
  // Tail
  cv.triangle(TAIL_X, BODY_TOP + 1, TAIL_X - 4, BODY_TOP - 1, TAIL_X - 4, BODY_TOP + 3, WING_COLOR);

  // Wings (fleeing only)
  if (wingSpread > 0) {
    cv.triangle(CX, BODY_TOP, CX - 2, BODY_TOP - wingSpread - 2, CX + 2, BODY_TOP - 1, WING_COLOR, 242);
  }

  // Body
  cv.ellipse(CX, BODY_TOP + PIGEON_H * 0.5, PIGEON_W / 2, (PIGEON_H * 0.85) / 2, BODY_COLOR);

  // Iridescent neck patch
  cv.ellipse(CX + PIGEON_W * 0.25, BODY_TOP + PIGEON_H * 0.35, (PIGEON_W * 0.35) / 2, (PIGEON_H * 0.35) / 2, NECK_COLOR, 153);

  // Head + beak + eye
  const headX = CX + PIGEON_W * 0.45;
  const headY = BODY_TOP - 0.5 + headDrop;
  cv.circle(headX, headY, 2, HEAD_COLOR);
  cv.triangle(headX + 1.6, headY, headX + 3.2, headY - 0.4, headX + 1.6, headY + 0.9, BEAK_COLOR);
  cv.set(headX + 0.3, headY - 1, EYE_COLOR);

  // Legs
  for (const leg of legs) cv.rect(leg.x, BODY_TOP + 5, 1, leg.h, LEG_COLOR);
}

const FRAMES = [
  { headDrop: 0,   wingSpread: 0, legs: [{ x: 7, h: 3 }, { x: 9, h: 3 }] }, // idle
  { headDrop: 1.5, wingSpread: 0, legs: [{ x: 7, h: 3 }, { x: 9, h: 3 }] }, // peck
  { headDrop: 0,   wingSpread: 0, legs: [{ x: 7, h: 3 }, { x: 9, h: 2 }] }, // walk A
  { headDrop: 0,   wingSpread: 0, legs: [{ x: 7, h: 2 }, { x: 9, h: 3 }] }, // walk B
  { headDrop: 0,   wingSpread: 2, legs: [{ x: 7, h: 2 }, { x: 9, h: 2 }] }, // flee A
  { headDrop: 0,   wingSpread: 5, legs: [{ x: 7, h: 2 }, { x: 9, h: 2 }] }, // flee B
];

const sheet = new Canvas(FRAME * FRAMES.length, FRAME);
for (let i = 0; i < FRAMES.length; i++) {
  const cv = new Canvas(FRAME, FRAME);
  drawPigeon(cv, FRAMES[i]);
  const ox = i * FRAME;
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const si = (y * FRAME + x) * 4;
      const di = (y * sheet.w + (x + ox)) * 4;
      sheet.data[di]     = cv.data[si];
      sheet.data[di + 1] = cv.data[si + 1];
      sheet.data[di + 2] = cv.data[si + 2];
      sheet.data[di + 3] = cv.data[si + 3];
    }
  }
}

const outPath = path.join(OUT_DIR, 'pigeon.png');
fs.writeFileSync(outPath, sheet.toBuffer());
console.log(`  wrote pigeon.png  ${sheet.w}x${sheet.h}  (${FRAMES.length} frames of ${FRAME}x${FRAME})`);
console.log(`Origin: (${CX / FRAME}, ${(BODY_TOP + PIGEON_H) / FRAME}) — maps to (p.x, p.y)`);
