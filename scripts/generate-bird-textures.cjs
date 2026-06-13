// Generates a tiny 2-frame flapping bird silhouette (assets/birds/bird.png)
// to replace the procedurally-drawn (Graphics ">" stroke path) distant
// flocks in src/objects/BirdFlock.ts.
//
// Drawn facing right with the body/head at the texture's right edge (the
// sprite's origin) and wings sweeping back-left, tapering to wingtips —
// flip via setFlipX for flocks flying left. Frame 0 = wings spread (up
// stroke), frame 1 = wings tucked (down stroke), alternated for a simple
// flap animation.
//
// Run: node scripts/generate-bird-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas, lighten, darken } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'birds');
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 16;
const H = 13;
const BODY_COLOR = 0x444444;
const BODY_X = 13, BODY_Y = 6; // also the sprite origin (tip/head)
const TIP_X = 1;
const MID_X = 7;

// Each wing is a triangle from the body/head point to a wingtip, bulging
// away from the body->wingtip line so it has visible area (a straight
// line from body to wingtip would be degenerate).
function drawBird(cv, wingDrop, bulge) {
  const topTipY = BODY_Y - wingDrop;
  const botTipY = BODY_Y + wingDrop;
  cv.triangle(BODY_X, BODY_Y, TIP_X, topTipY, MID_X, topTipY - bulge, lighten(BODY_COLOR, 0.25));
  cv.triangle(BODY_X, BODY_Y, TIP_X, botTipY, MID_X, botTipY + bulge, darken(BODY_COLOR, 0.2));
  cv.circle(BODY_X, BODY_Y, 1, BODY_COLOR);
}

const sheet = new Canvas(W * 2, H);

// Frame 0: wings spread wide (up-stroke)
{
  const cv = new Canvas(W, H);
  drawBird(cv, 5, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, j = (y * sheet.w + x) * 4;
    for (let c = 0; c < 4; c++) sheet.data[j + c] = cv.data[i + c];
  }
}
// Frame 1: wings tucked close to body (down-stroke)
{
  const cv = new Canvas(W, H);
  drawBird(cv, 2, 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, j = (y * sheet.w + (x + W)) * 4;
    for (let c = 0; c < 4; c++) sheet.data[j + c] = cv.data[i + c];
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'bird.png'), sheet.toBuffer());
console.log(`wrote bird.png  ${sheet.w}x${sheet.h}  (2 frames of ${W}x${H})`);
console.log(`Origin (body/head): (${BODY_X / W}, ${BODY_Y / H})`);
