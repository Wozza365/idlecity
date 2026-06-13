// Generates small pixel-art cyclist sprite sheets (assets/cyclists/*.png) to
// replace the procedurally-drawn (Graphics circles/rects) verge cyclists in
// src/objects/VergeRiver.ts.
//
// Each output file is a 2-frame horizontal sprite sheet (frame size
// CYCLIST_W x CYCLIST_H) showing a pedalling animation, one file per jersey
// colour in the verge palette's `cyclistColors`.
//
// Run: node scripts/generate-cyclist-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas, darken, lighten } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'cyclists');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CYCLIST_W = 26;
const CYCLIST_H = 24;

// Mirrors src/theme/themes/ClassicTheme.ts verge.cyclistColors
const JERSEY_COLORS = [0x4ecdc4, 0xff6b6b, 0x95e77e, 0xffd93d, 0xc77dff, 0xff9f43];

const TIRE_COLOR  = 0x14141c;
const RIM_COLOR   = 0x8a8aa0;
const FRAME_COLOR = 0x454560;
const SKIN_COLOR  = 0xf0c8a0;
const PANTS_COLOR = 0x3a5a8a;

// Fixed bike geometry — wheel centres sit on row WHEEL_Y (the cycle lane
// midline). Sprite origin should be set to (0.5, WHEEL_Y / CYCLIST_H).
const WHEEL_Y = 18;
const WHEEL_R = 4;
const REAR_X  = 7;
const FRONT_X = 19;

const SEAT   = [10, 11];
const HANDLE = [18, 10];
const CRANK  = [13, 17];
const HIP    = [11, 11];
const BODY   = [12, 7];
const HEAD   = [14, 3];

function drawWheel(cv, cx) {
  cv.circle(cx, WHEEL_Y, WHEEL_R, TIRE_COLOR);
  cv.circle(cx, WHEEL_Y, WHEEL_R - 1, RIM_COLOR, 70);
  cv.circle(cx, WHEEL_Y, WHEEL_R - 1, TIRE_COLOR, 220);
  // spoke cross + hub
  cv.line(cx - WHEEL_R + 1, WHEEL_Y, cx + WHEEL_R - 1, WHEEL_Y, RIM_COLOR, 140);
  cv.line(cx, WHEEL_Y - WHEEL_R + 1, cx, WHEEL_Y + WHEEL_R - 1, RIM_COLOR, 140);
  cv.circle(cx, WHEEL_Y, 1, RIM_COLOR);
}

function drawFrame(cv) {
  cv.line(REAR_X, WHEEL_Y, SEAT[0], SEAT[1], FRAME_COLOR);
  cv.line(SEAT[0], SEAT[1], HANDLE[0], HANDLE[1], FRAME_COLOR);
  cv.line(SEAT[0], SEAT[1], CRANK[0], CRANK[1], FRAME_COLOR);
  cv.line(CRANK[0], CRANK[1], REAR_X, WHEEL_Y, FRAME_COLOR);
  cv.line(HANDLE[0], HANDLE[1], FRONT_X, WHEEL_Y, FRAME_COLOR);
  cv.line(CRANK[0], CRANK[1], FRONT_X - 1, WHEEL_Y - 1, FRAME_COLOR, 180);
  // saddle
  cv.line(SEAT[0] - 1, SEAT[1] - 1, SEAT[0] + 2, SEAT[1] - 1, 0x222230);
  // handlebar stem + grip
  cv.line(HANDLE[0], HANDLE[1], HANDLE[0], HANDLE[1] - 2, FRAME_COLOR);
  cv.line(HANDLE[0] - 1, HANDLE[1] - 2, HANDLE[0] + 1, HANDLE[1] - 2, 0x222230);
  // pedal/crank hub
  cv.circle(CRANK[0], CRANK[1], 1, 0x222230);
}

function drawRider(cv, jersey, legPhase) {
  // Torso (rounded blob, jersey colour)
  cv.circle(BODY[0], BODY[1], 3, jersey);
  cv.circle(BODY[0] - 1, BODY[1] - 1, 1, lighten(jersey, 0.3), 160);

  // Head + helmet (helmet covers the top half of the head circle)
  cv.circle(HEAD[0], HEAD[1], 3, SKIN_COLOR);
  cv.circle(HEAD[0], HEAD[1] - 1, 3, darken(jersey, 0.25), 235);
  // eye
  cv.set(HEAD[0] + 2, HEAD[1] + 1, 0x202020, 200);

  // Arm reaching to handlebar grip
  cv.line(BODY[0] + 2, BODY[1] + 1, HANDLE[0] - 1, HANDLE[1] - 1, SKIN_COLOR);
  cv.line(BODY[0] + 2, BODY[1] + 2, HANDLE[0] - 1, HANDLE[1], SKIN_COLOR, 200);

  // Legs — two phases of the pedal stroke: one leg extended toward the
  // crank, the other drawn back with a bent knee. Drawn 2px thick.
  const extended = legPhase === 0
    ? { knee: [12, 14], foot: [13, 17] }
    : { knee: [10, 15], foot: [12, 17] };
  const bent = legPhase === 0
    ? { knee: [9, 14],  foot: [11, 17] }
    : { knee: [11, 14], foot: [13, 17] };

  for (const leg of [bent, extended]) {
    cv.line(HIP[0], HIP[1], leg.knee[0], leg.knee[1], PANTS_COLOR);
    cv.line(HIP[0] + 1, HIP[1], leg.knee[0] + 1, leg.knee[1], PANTS_COLOR, 200);
    cv.line(leg.knee[0], leg.knee[1], leg.foot[0], leg.foot[1], PANTS_COLOR);
    cv.set(leg.foot[0], leg.foot[1], 0x222230);
  }
}

for (let ci = 0; ci < JERSEY_COLORS.length; ci++) {
  const jersey = JERSEY_COLORS[ci];
  const sheet = new Canvas(CYCLIST_W * 2, CYCLIST_H);

  for (let frame = 0; frame < 2; frame++) {
    const cv = new Canvas(CYCLIST_W, CYCLIST_H);
    drawWheel(cv, REAR_X);
    drawWheel(cv, FRONT_X);
    drawFrame(cv);
    drawRider(cv, jersey, frame);

    const ox = frame * CYCLIST_W;
    for (let y = 0; y < CYCLIST_H; y++) {
      for (let x = 0; x < CYCLIST_W; x++) {
        const i = (y * CYCLIST_W + x) * 4;
        const j = (y * sheet.w + (x + ox)) * 4;
        sheet.data[j] = cv.data[i];
        sheet.data[j + 1] = cv.data[i + 1];
        sheet.data[j + 2] = cv.data[i + 2];
        sheet.data[j + 3] = cv.data[i + 3];
      }
    }
  }

  const outPath = path.join(OUT_DIR, `cyclist_${ci}.png`);
  fs.writeFileSync(outPath, sheet.toBuffer());
  console.log(`  wrote cyclist_${ci}.png  ${sheet.w}x${sheet.h}`);
}
console.log(`Done. ${JERSEY_COLORS.length} cyclist sprite sheets written to ${OUT_DIR}`);
console.log(`Frame size: ${CYCLIST_W}x${CYCLIST_H}, wheel row at y=${WHEEL_Y} (origin Y = ${(WHEEL_Y / CYCLIST_H).toFixed(3)})`);
