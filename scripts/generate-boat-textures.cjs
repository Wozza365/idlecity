// Generates pixel-art boat textures (assets/boats/*.png) to replace the
// procedurally-drawn (Graphics-primitive) boats in src/objects/Boat.ts.
//
// Every texture gets a 1px transparent border (TEX_PAD) so a dark outline
// can be drawn cleanly around the whole silhouette without clipping —
// boatOriginY() in src/objects/BoatAssets.ts compensates for this border
// when anchoring the sprite to the hull's vertical centre.
//
// Run: node scripts/generate-boat-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas, lighten, darken } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'boats');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TEX_PAD = 1;
const OUTLINE = 0x16212C;

// Offsets every draw call by (ox, oy) so detail functions can keep using
// 0-based coordinates while the underlying canvas carries a transparent
// border for the outline pass.
class OffsetCanvas {
  constructor(cv, ox, oy) { this.cv = cv; this.ox = ox; this.oy = oy; }
  set(x, y, hex, a) { this.cv.set(x + this.ox, y + this.oy, hex, a); }
  rect(x, y, w, h, hex, a) { this.cv.rect(x + this.ox, y + this.oy, w, h, hex, a); }
  circle(cx, cy, r, hex, a) { this.cv.circle(cx + this.ox, cy + this.oy, r, hex, a); }
  ellipse(cx, cy, rx, ry, hex, a) { this.cv.ellipse(cx + this.ox, cy + this.oy, rx, ry, hex, a); }
  line(x0, y0, x1, y1, hex, a) { this.cv.line(x0 + this.ox, y0 + this.oy, x1 + this.ox, y1 + this.oy, hex, a); }
  triRight(x0, x1, cy, halfH, hex, a) { this.cv.triRight(x0 + this.ox, x1 + this.ox, cy + this.oy, halfH, hex, a); }
  triangle(x1, y1, x2, y2, x3, y3, hex, a) {
    this.cv.triangle(x1 + this.ox, y1 + this.oy, x2 + this.ox, y2 + this.oy, x3 + this.ox, y3 + this.oy, hex, a);
  }
}

// Fills every fully-transparent pixel that touches an opaque pixel with a
// dark outline colour, giving each sprite a crisp silhouette against the
// water regardless of hull colour.
function applyOutline(cv, color = OUTLINE, threshold = 24) {
  const { w, h, data } = cv;
  const orig = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) orig[i] = data[i * 4 + 3];
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && orig[y * w + x] > threshold;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (orig[y * w + x] > threshold) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        cv.set(x, y, color, 255);
      }
    }
  }
}

// ── Shared hull/deck rendering ──────────────────────────────────────────
function drawHull(cv, y0, w, h, rectW, hull) {
  const hi  = lighten(hull, 0.22);
  const mid = lighten(hull, 0.08);
  const lo  = darken(hull, 0.35);
  const lo2 = darken(hull, 0.6);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rectW; x++) {
      let col = hull;
      if (y === 0) col = hi;
      else if (y === h - 1) col = lo2;
      else if (y === h - 2) col = lo;
      else if (y % 3 === 0) col = mid;
      cv.set(x, y0 + y, col);
    }
  }
  // bow taper
  const cy = y0 + Math.floor((h - 1) / 2);
  cv.triRight(rectW, w - 1, cy, Math.floor(h / 2), hull);
}

function drawDeck(cv, y0, rectW, h, hull, opts = {}) {
  const deckColor = opts.color ?? lighten(hull, 0.35);
  const alpha = opts.alpha ?? 170;
  for (let y = y0 + 1; y < y0 + h - 1; y++) {
    for (let x = 2; x < rectW - 1; x++) cv.set(x, y, deckColor, alpha);
  }
}

function drawNavLights(cv, y0, h, rectW, w) {
  const sy = y0 + Math.floor(rectW / 2);
  cv.set(sy, y0, 0xff3333, 150);
  cv.set(sy, y0 + h - 1, 0x33ff55, 150);
  if (w >= 36) cv.set(0, y0 + Math.floor((h - 1) / 2), 0xffffff, 160);
}

// ── Boat definitions (mirrors src/objects/BoatAssets.ts) ──────────────────
// Sizes are roughly 2.4x-3.2x the original, with smaller craft scaled up
// more (for visibility) and the largest vessels scaled up less. cruise_ship
// is an all-new mega-boat — a "legendary" sibling to container_ship.
const BOATS = [
  { key: 'rowboat',        w: 60,  h: 20, bowW:  9, hull: 0x8B5E3C, accent: 0xA0724E },
  { key: 'motorboat',      w: 100, h: 28, bowW: 14, hull: 0x1A4E8A, accent: 0xFFFFFF },
  { key: 'fishing_boat',   w: 84,  h: 30, bowW: 11, hull: 0x3A5C7A, accent: 0xCC3333, extraTop: 12 },
  { key: 'sailboat',       w: 80,  h: 26, bowW: 11, hull: 0x2A5C8A, accent: 0xE8C070, extraTop: 42 },
  { key: 'kayak',          w: 70,  h: 16, bowW: 10, hull: 0xFF7744, accent: 0xFFAA22 },
  { key: 'speedboat',      w: 108, h: 22, bowW: 17, hull: 0xCC2222, accent: 0xFFFFFF },
  { key: 'tugboat',        w: 108, h: 36, bowW: 14, hull: 0x222233, accent: 0xFF4400, extraTop: 28 },
  { key: 'yacht',          w: 145, h: 35, bowW: 19, hull: 0xF8F8F2, accent: 0x888899, extraTop: 57 },
  { key: 'pedalo',         w: 70,  h: 28, bowW: 10, hull: 0xFFDD22, accent: 0xFF9900 },
  { key: 'houseboat',      w: 144, h: 42, bowW: 10, hull: 0x9B7A4A, accent: 0xC89A60 },
  { key: 'ferry',          w: 162, h: 36, bowW: 14, hull: 0xE2E2E2, accent: 0x3366AA },
  { key: 'container_ship', w: 210, h: 46, bowW: 12, hull: 0x182838, accent: 0x3A88AA },
  { key: 'cruise_ship',    w: 340, h: 64, bowW: 24, hull: 0xF5F5F0, accent: 0xCC3333, extraTop: 54 },
];

// ── Type-specific details ──────────────────────────────────────────────
const DETAILS = {
  rowboat(cv, c) {
    const { y0, h, rectW, hull } = c;
    for (let y = y0 + 2; y < y0 + h - 1; y += 2) {
      for (let x = 2; x < rectW - 1; x++) cv.set(x, y, darken(hull, 0.18), 110);
    }
    // bench seats
    for (const sx of [Math.floor(rectW * 0.32), Math.floor(rectW * 0.62)]) {
      for (let y = y0 + 2; y < y0 + h - 2; y++) cv.set(sx, y, lighten(hull, 0.32), 220);
      cv.set(sx, y0 + 1, 0x5A3A1A);
      cv.set(sx, y0 + h - 2, 0x5A3A1A);
    }
    // oar resting along the inside of the hull
    for (let x = 3; x < rectW - 3; x++) cv.set(x, y0 + 1, 0x8B5A2B, 180);
    cv.circle(rectW - 4, y0 + 1, 1, 0xC8A46E, 200);
  },

  motorboat(cv, c) {
    const { y0, h, rectW, hull, accent } = c;
    // Bold white waterline stripe (3px) — the signature feature of a fast launch
    const stripeTop = y0 + Math.floor(h * 0.3);
    for (let x = 1; x < rectW - 1; x++) {
      cv.set(x, stripeTop,     accent, 240);
      cv.set(x, stripeTop + 1, accent, 240);
      cv.set(x, stripeTop + 2, accent, 200);
    }
    // Open cockpit covering the forward third — windshield + interior
    const cpX = rectW - 30, cpW = 28;
    const cpH = h - 6;
    cv.rect(cpX, y0 + 2, cpW, cpH, lighten(hull, 0.18), 230);
    // Angled windshield glass (wider at top, narrower at bottom)
    for (let y = y0 + 2; y <= y0 + 2 + Math.floor(cpH * 0.55); y++) {
      const slant = Math.floor((y - y0 - 2) * 0.25);
      for (let x = cpX + slant; x < cpX + cpW - 1; x++) cv.set(x, y, 0x99CCFF, 200);
    }
    // Windshield chrome frame
    cv.line(cpX,     y0 + 2, cpX,     y0 + 2 + Math.floor(cpH * 0.55), 0xDDDDDD, 220);
    cv.line(cpX + cpW - 1, y0 + 2, cpX + cpW - 1, y0 + 2 + Math.floor(cpH * 0.55), 0xDDDDDD, 220);
    // Steering wheel silhouette
    cv.circle(cpX + Math.floor(cpW * 0.4), y0 + 3 + Math.floor(cpH * 0.55), 2, 0xAA8833, 200);
    // Engine cowl at stern — ribbed hatch
    const cowlX = 2, cowlW = Math.floor(rectW * 0.22);
    cv.rect(cowlX, y0 + 3, cowlW, h - 6, darken(hull, 0.15), 235);
    for (let x = cowlX + 2; x < cowlX + cowlW; x += 3) cv.set(x, y0 + 4, 0x000000, 60);
    // Chrome nose rail
    for (let y = y0 + 1; y < y0 + h - 1; y++) cv.set(0, y, lighten(hull, 0.5), 180);
    // Rope cleat on foredeck
    cv.rect(cowlX + cowlW + 2, y0 + 2, 3, 2, 0xCCCCCC, 200);
  },

  fishing_boat(cv, c) {
    const { y0, h, rectW, accent, extraTop } = c;
    const cx0 = Math.floor(rectW * 0.22), cw = Math.floor(rectW * 0.42);
    // cabin
    cv.rect(cx0, y0 + 2, cw, h - 5, accent, 235);
    // cabin roof, rising into the extraTop region
    const roofH = Math.floor(extraTop * 0.4);
    cv.rect(cx0 - 1, y0 - roofH, cw + 2, roofH + 2, darken(accent, 0.35), 240);
    // windows
    for (let wx = cx0 + 2; wx < cx0 + cw - 2; wx += 4) cv.rect(wx, y0 + 3, 2, 3, 0xBFE6FF, 220);
    // mast/antenna with nav light
    const mastX = cx0 + Math.floor(cw / 2);
    cv.line(mastX, y0 - roofH, mastX, y0 - extraTop + 1, 0x333333);
    cv.set(mastX, y0 - extraTop + 1, 0xFF4444);
    // crane arm toward the stern
    cv.line(2, y0 + 1, Math.floor(rectW * 0.16), y0 - 2, 0x886644, 220);
    // coiled rope on the stern deck
    cv.circle(3, y0 + h - 3, 2, 0x886644, 200);
    // net texture along the gunwale
    for (let x = Math.floor(rectW * 0.6); x < rectW - 2; x += 2) cv.set(x, y0 + 1, 0xCCCCCC, 140);
  },

  sailboat(cv, c) {
    const { y0, h, rectW, hull, accent, extraTop, bowW } = c;
    const mastX = rectW - 14;
    const topY = y0 - extraTop + 1;
    const mastBaseY = y0 + Math.floor(h / 2);
    const clewX = rectW - 2, clewY = topY + Math.floor(extraTop * 0.58);
    // Mast — dark wood
    cv.line(mastX, topY, mastX, y0 + h - 2, 0x6B4C1A);
    // Mainsail — golden/amber canvas so it reads clearly against sky and hull
    const sailColor = accent; // 0xE8C070 warm amber
    cv.triangle(mastX, topY, mastX, mastBaseY, clewX, clewY, sailColor, 240);
    // Sail shading — darker along the leech for curvature
    cv.line(mastX, topY, clewX, clewY, darken(sailColor, 0.22), 200);
    // Horizontal batten lines across the sail for texture
    for (let i = 1; i <= 3; i++) {
      const batY = topY + Math.floor((mastBaseY - topY) * (i / 4));
      const batX = mastX + Math.floor((clewX - mastX) * (i / 4));
      cv.line(mastX, batY, batX, batY + Math.floor((clewY - mastBaseY) * (i / 4)), darken(sailColor, 0.12), 160);
    }
    // Boom — spar along the sail's foot
    cv.line(mastX, mastBaseY, clewX, clewY, 0x6B4C1A);
    // Jib/foresail — bright white so it contrasts with amber mainsail
    const jibLuffY = topY + Math.floor(extraTop * 0.28);
    const jibFootY = y0 + Math.floor(h * 0.55);
    const jibTipX = rectW + Math.floor(bowW * 0.75), jibTipY = y0 + Math.floor(h * 0.3);
    cv.triangle(mastX, jibLuffY, mastX, jibFootY, jibTipX, jibTipY, 0xFFFFFF, 235);
    // Jib edges outlined dark so it reads against the amber main
    cv.line(mastX, jibLuffY, jibTipX, jibTipY, darken(0xFFFFFF, 0.35), 180);
    cv.line(mastX, jibFootY, jibTipX, jibTipY, darken(0xFFFFFF, 0.35), 180);
    // Pennant — amber pennant at masthead
    cv.triangle(mastX, topY, mastX + 8, topY + 2, mastX, topY + 5, 0xFF4444, 240);
    // Hull accent stripe (dark waterline)
    for (let x = 1; x < rectW - 1; x++) cv.set(x, y0 + h - 2, darken(hull, 0.3), 220);
    // Cabin hatch — small rectangle on deck
    cv.rect(4, y0 + 2, 10, h - 6, lighten(hull, 0.25), 220);
    cv.rect(5, y0 + 3, 3, 3, 0x88AACC, 200);
    // Deck cleat near stern
    cv.rect(Math.floor(rectW * 0.12), y0 + 2, 3, 2, 0xCCCCCC, 200);
    // Lifeline posts along deck
    for (let x = 16; x < mastX - 3; x += 6) cv.set(x, y0 + 1, 0xCCCCCC, 160);
  },

  kayak(cv, c) {
    const { y0, h, rectW, accent } = c;
    const midY = y0 + Math.floor((h - 1) / 2);
    // hull centreline stripe
    for (let x = 1; x < rectW - 1; x++) cv.set(x, midY, accent, 200);
    // cockpit rim
    cv.ellipse(Math.floor(rectW * 0.4), midY, 6, Math.floor(h * 0.32), darken(accent, 0.3), 200);
    cv.ellipse(Math.floor(rectW * 0.4), midY, 5, Math.floor(h * 0.22), 0x333333, 220);
    // paddler — torso + head
    cv.rect(Math.floor(rectW * 0.36), midY - 3, 5, 5, 0xE0B080, 230);
    cv.circle(Math.floor(rectW * 0.4), midY - 5, 2, 0xC89060, 230);
    // double-bladed paddle, diagonal across the kayak
    cv.line(Math.floor(rectW * 0.18), midY - 5, Math.floor(rectW * 0.62), midY + 5, 0x8B5A2B, 220);
    cv.rect(Math.floor(rectW * 0.16) - 1, midY - 6, 4, 2, 0xDDDDDD, 220);
    cv.rect(Math.floor(rectW * 0.62) - 1, midY + 4, 4, 2, 0xDDDDDD, 220);
  },

  speedboat(cv, c) {
    const { y0, h, rectW, hull, accent } = c;
    // White top-deck stripe along the top half — classic red-white speedboat livery
    for (let x = 1; x < rectW - 1; x++) {
      cv.set(x, y0,     accent, 235);
      cv.set(x, y0 + 1, accent, 235);
      cv.set(x, y0 + 2, accent, 200);
    }
    // White stripe also along the waterline
    for (let x = 1; x < rectW - 1; x++) {
      cv.set(x, y0 + h - 1, accent, 220);
      cv.set(x, y0 + h - 2, accent, 160);
    }
    // Open cockpit: sits in the forward third, slightly inset from waterline
    const cockpitX = rectW - 30, cockpitW = 26;
    cv.rect(cockpitX, y0 + 3, cockpitW, h - 6, 0x111111, 200);
    // Windshield glass — angled slab in upper cockpit area
    const wsH = Math.max(3, Math.floor((h - 6) * 0.55));
    for (let y = y0 + 3; y < y0 + 3 + wsH; y++) {
      const slant = Math.floor((y - y0 - 3) * 0.3);
      for (let x = cockpitX + slant; x < cockpitX + cockpitW - 1; x++) cv.set(x, y, 0x88DDFF, 185);
    }
    // Windshield frame bar
    cv.set(cockpitX, y0 + 3, 0xDDDDDD, 220);
    cv.set(cockpitX, y0 + 3 + wsH, 0xDDDDDD, 220);
    // Engine cowl — ribbed hatch at stern end
    const cowlX = 2, cowlW = 14;
    cv.rect(cowlX, y0 + 2, cowlW, h - 4, darken(hull, 0.2), 230);
    for (let y = y0 + 3; y < y0 + h - 2; y += 2) cv.set(cowlX + 2, y, 0x000000, 80);
    for (let y = y0 + 3; y < y0 + h - 2; y += 2) cv.set(cowlX + 5, y, 0x000000, 80);
    for (let y = y0 + 3; y < y0 + h - 2; y += 2) cv.set(cowlX + 9, y, 0x000000, 80);
    // Chrome exhaust pipe at stern
    cv.rect(2, y0 + Math.floor(h / 2) - 1, 3, 2, 0x888888, 200);
  },

  tugboat(cv, c) {
    const { y0, h, rectW, accent, extraTop } = c;
    const cx0 = Math.floor(rectW * 0.18), cw = Math.floor(rectW * 0.40);
    // wheelhouse — roughly 60% of the hull's height, leaving an open deck astern
    const houseH = Math.floor(h * 0.6);
    cv.rect(cx0, y0 + 1, cw, houseH, accent, 235);
    // shadow line where the wheelhouse meets the deck
    cv.rect(cx0, y0 + houseH, cw, 1, darken(accent, 0.35), 235);
    // wheelhouse roof (set back, narrower)
    const upperH = Math.floor(extraTop * 0.35);
    const cw2 = Math.floor(cw * 0.7), cx02 = cx0 + Math.floor((cw - cw2) / 2);
    cv.rect(cx02, y0 - upperH, cw2, upperH + 1, lighten(accent, 0.15), 235);
    // two rows of windows on the wheelhouse
    for (const wy of [y0 + 3, y0 + houseH - 2]) {
      for (let wx = cx0 + 2; wx < cx0 + cw - 2; wx += 4) cv.rect(wx, wy, 2, 2, 0xCCEEFF, 255);
    }
    // roof windows
    for (let wx = cx02 + 1; wx < cx02 + cw2 - 1; wx += 3) cv.set(wx, y0 - upperH + 1, 0xCCEEFF, 255);
    // funnel with stripe and a wisp of smoke
    const fx = cx0 + Math.floor(cw / 2);
    cv.rect(fx - 2, y0 - extraTop + 2, 5, extraTop - 2, 0x333333);
    cv.rect(fx - 2, y0 - extraTop + 2, 5, 3, accent);
    cv.circle(fx, y0 - extraTop, 2, 0x888888, 120);
    // tire fenders along the open aft deck
    for (let x = cx0 + cw + 4; x < rectW - 4; x += 7) cv.circle(x, y0 + h - 1, 2, 0x222222, 200);
  },

  yacht(cv, c) {
    const { y0, h, rectW, accent, extraTop } = c;
    // main cabin, sitting on the main deck — accent-tinted so it reads
    // against the pale hull instead of blending into it
    const cabinColor = lighten(accent, 0.55);
    const dx0 = Math.floor(rectW * 0.12), dw = Math.floor(rectW * 0.5);
    const cabinH = Math.floor(h * 0.55);
    cv.rect(dx0, y0 + 1, dw, cabinH, cabinColor, 235);
    cv.rect(dx0, y0 + 1, dw, 1, lighten(cabinColor, 0.25), 235);
    for (let wx = dx0 + 2; wx < dx0 + dw - 2; wx += 4) cv.rect(wx, y0 + 3, 2, 2, 0x336688, 220);
    // shadow line where the cabin meets the main deck
    cv.rect(dx0, y0 + cabinH, dw, 1, darken(cabinColor, 0.35), 235);
    // upper deck, set back and narrower, standing directly on the cabin roof
    const upperH = Math.floor(cabinH * 0.7);
    const dw2 = Math.floor(dw * 0.6), dx02 = dx0 + Math.floor((dw - dw2) / 2);
    cv.rect(dx02, y0 - upperH + 1, dw2, upperH, lighten(cabinColor, 0.3), 235);
    for (let wx = dx02 + 1; wx < dx02 + dw2 - 1; wx += 3) cv.set(wx, y0 - upperH + 2, 0x336688, 220);
    // railing along the main deck
    for (let x = dx0; x < dx0 + dw; x += 3) cv.set(x, y0, 0xCCCCCC, 160);
    // mast + mainsail
    const mastX = rectW - 18;
    const topY = y0 - extraTop + 1;
    cv.line(mastX, topY, mastX, y0 + h - 2, 0xAA9966);
    cv.triangle(mastX, topY, mastX, y0 + Math.floor(h / 2), rectW - 2, topY + Math.floor(extraTop * 0.55), 0xFFFFF8, 230);
    // pennant
    cv.triangle(mastX, topY, mastX + 8, topY + 2, mastX, topY + 5, accent, 230);
    // sundeck circle near the stern
    cv.circle(Math.floor(rectW * 0.18), y0, 3, 0xCCCCCC, 180);
  },

  pedalo(cv, c) {
    const { y0, h, rectW, accent } = c;
    // pedal wheels with spokes
    for (const wy of [y0 + 2, y0 + h - 3]) {
      cv.circle(4, wy, 4, accent, 230);
      cv.circle(4, wy, 2, 0xDD8800, 230);
      cv.line(0, wy, 8, wy, darken(accent, 0.3), 200);
      cv.line(4, wy - 4, 4, wy + 4, darken(accent, 0.3), 200);
    }
    // seat cushions
    for (const sy of [y0 + 4, y0 + h - 8]) cv.rect(10, sy, Math.floor(rectW * 0.4), 4, lighten(accent, 0.3), 220);
    // canopy posts + roof
    for (const px of [10, 10 + Math.floor(rectW * 0.4) - 2]) cv.line(px, y0, px, y0 + h - 9, 0xCCCCCC, 200);
    cv.rect(8, y0, Math.floor(rectW * 0.4) + 4, 1, lighten(accent, 0.5), 220);
    // accent trim along the hull
    for (let x = 12; x < rectW - 2; x++) cv.set(x, y0 + h - 1, accent, 160);
  },

  houseboat(cv, c) {
    const { y0, h, rectW, hull, accent } = c;
    const hx0 = 3, hw = rectW - 8;
    // Layout from top to bottom within the 42px hull:
    // y0     to y0+4:  roof (4px, darker)
    // y0+4   to y0+32: main cabin walls + windows (28px)
    // y0+32  to y0+42: pontoon/hull base (10px, much darker)

    const roofH = 4;
    const pontoonH = 8;
    const cabinTop = y0 + roofH;
    const cabinBot = y0 + h - pontoonH;
    const cabinH   = cabinBot - cabinTop; // = 30px

    // Roof band — darker accent
    cv.rect(hx0 - 1, y0,     hw + 2, roofH, darken(accent, 0.3), 250);
    cv.rect(hx0 - 1, y0,     hw + 2, 1,     darken(accent, 0.55), 250);
    // Small chimney on the roof (rightish, fits within hull bounds)
    const chX = hx0 + Math.floor(hw * 0.7);
    cv.rect(chX, y0, 5, roofH + 2, darken(hull, 0.45), 255);
    cv.rect(chX + 1, y0, 3, 1, 0x222222, 255); // chimney cap

    // Cabin wall (main body)
    cv.rect(hx0 + 1, cabinTop, hw - 2, cabinH, accent, 240);
    // Cabin-roof shadow line (where roof overhang meets the wall)
    cv.rect(hx0 + 1, cabinTop, hw - 2, 1, darken(accent, 0.35), 240);

    // Windows — larger, evenly spaced, with warm glow interior
    const winW = 8, winH2 = Math.max(6, cabinH - 10);
    const winTop = cabinTop + Math.floor((cabinH - winH2) / 2);
    for (let wx = hx0 + 6; wx < hx0 + hw - 14; wx += 13) {
      if (wx + winW > chX - 2) continue; // skip if overlaps chimney
      cv.rect(wx, winTop, winW, winH2, darken(accent, 0.12), 235); // frame surround
      cv.rect(wx + 1, winTop + 1, winW - 2, winH2 - 2, 0xFFEE88, 210); // warm glass
      // Cross-bar divider: vertical + horizontal
      cv.line(wx + Math.floor(winW / 2), winTop + 1, wx + Math.floor(winW / 2), winTop + winH2 - 2, darken(accent, 0.25), 180);
      cv.line(wx + 1, winTop + Math.floor(winH2 / 2), wx + winW - 2, winTop + Math.floor(winH2 / 2), darken(accent, 0.25), 180);
    }

    // Pontoon/hull base — very dark, reads as the waterline platform
    const pontoonColor = darken(hull, 0.4);
    cv.rect(hx0 - 1, cabinBot, hw + 2, pontoonH, pontoonColor, 250);
    cv.rect(hx0 - 1, cabinBot, hw + 2, 1, darken(pontoonColor, 0.3), 250);
    // Mooring cleats on the pontoon
    cv.rect(hx0 + 3,      cabinBot + 2, 4, 2, 0x888888, 220);
    cv.rect(hx0 + hw - 7, cabinBot + 2, 4, 2, 0x888888, 220);
    // Railing posts along the upper deck edge
    for (let x = hx0 + 1; x < hx0 + hw - 1; x += 5) cv.set(x, y0 + roofH - 1, 0xBBBBBB, 180);
  },

  ferry(cv, c) {
    const { y0, h, rectW, hull, accent } = c;
    // Two clear passenger decks — light grey upper, slightly darker lower
    const deckBand = Math.floor(h / 2);
    cv.rect(1, y0 + 1, rectW - 2, deckBand - 1, 0xDDDDDD, 235);
    cv.rect(1, y0 + deckBand, rectW - 2, h - deckBand - 1, 0xCCCCCC, 235);
    // Deck divider rail — bold accent stripe separates upper and lower
    for (let x = 1; x < rectW - 1; x++) {
      cv.set(x, y0 + deckBand - 1, accent, 240);
      cv.set(x, y0 + deckBand,     accent, 240);
    }
    // Bold accent band at waterline (company livery)
    for (let x = 1; x < rectW - 1; x++) {
      cv.set(x, y0 + h - 4, accent, 230);
      cv.set(x, y0 + h - 3, accent, 230);
    }
    // Upper-deck windows — larger, grouped in sets of 3 with gaps
    for (let gx = 4; gx < rectW - 16; gx += 12) {
      for (let wx = 0; wx < 3; wx++) {
        cv.rect(gx + wx * 4, y0 + 3, 3, deckBand - 6, 0x99CCEE, 220);
      }
    }
    // Lower-deck windows — same grouping but smaller
    for (let gx = 4; gx < rectW - 16; gx += 12) {
      for (let wx = 0; wx < 3; wx++) {
        cv.rect(gx + wx * 4, y0 + deckBand + 3, 3, h - deckBand - 9, 0xAACCDD, 200);
      }
    }
    // Bridge/wheelhouse at the bow — sits inside the hull, taller than
    // the passenger decks it overwrites, so it reads as a raised structure
    const bx0 = rectW - Math.floor(rectW * 0.22), bw = Math.floor(rectW * 0.18);
    const bridgeH = Math.floor(h * 0.7); // tall enough to read as superstructure
    cv.rect(bx0, y0, bw, bridgeH, 0xEEEEEE, 255);
    cv.rect(bx0, y0, bw, 2, accent, 245);  // accent roof trim
    // Bridge windows
    for (let wx = bx0 + 2; wx < bx0 + bw - 2; wx += 4) cv.rect(wx, y0 + 3, 3, 3, 0x5588AA, 230);
    // Funnel stack on the bridge — stays within hull (at y0 + a few px)
    const fxB = bx0 + Math.floor(bw / 2) - 2;
    cv.rect(fxB, y0 + bridgeH - 1, 5, h - bridgeH, 0x444444, 255); // extends down only
    cv.rect(fxB, y0 + bridgeH - 1, 5, 2, accent, 255);
    // Life rings at lower hull edge — stop before the bridge
    for (let x = 12; x < bx0 - 10; x += 16) cv.circle(x, y0 + h - 2, 2, 0xFF7700, 230);
  },

  container_ship(cv, c) {
    const { y0, h, rectW } = c;
    const colors = [0xFF4444, 0x44AA44, 0x4444FF, 0xFFAA22, 0xFF44AA, 0x44FFAA, 0xAA66FF];
    const cw = 14, gap = 1, rowH = Math.floor((h - 6) / 3);
    let ci = 0;
    for (let cx = 4; cx + cw < rectW - 26; cx += cw + gap) {
      for (let row = 0; row < 3; row++) {
        cv.rect(cx, y0 + 2 + row * (rowH + 1), cw, rowH, colors[(ci + row) % colors.length], 235);
      }
      ci++;
    }
    // bridge superstructure at the stern
    const bx0 = rectW - 26;
    cv.rect(bx0, y0 + 1, 24, h - 2, 0xCCCCCC, 235);
    for (let wy = y0 + 3; wy < y0 + h - 4; wy += 4) {
      for (let wx = bx0 + 3; wx < bx0 + 21; wx += 4) cv.set(wx, wy, 0x6699CC, 220);
    }
    cv.rect(bx0 + 2, y0, 20, 1, 0xFFFFFF, 230);
  },

  // ── New mega-boat ─────────────────────────────────────────────────────
  // A multi-deck cruise liner: white upper-deck superstructure (with three
  // rows of cabin windows) over a steel-blue lower hull (portholes) and a
  // dark waterline, plus twin funnels, a forward bridge and a pool deck —
  // all standing on the main deck (row y0), so they read as part of the hull
  // rather than floating above it.
  cruise_ship(cv, c) {
    const { y0, h, rectW, accent, extraTop } = c;
    const hull2 = 0x2E4A66; // steel-blue lower hull, distinct from the white superstructure

    // steel-blue lower hull band with two rows of portholes
    const lowerY = y0 + 26, lowerH = 30;
    cv.rect(0, lowerY, rectW, lowerH, hull2, 255);
    cv.rect(0, lowerY, rectW, 1, lighten(hull2, 0.2), 255);
    for (let x = 8; x < rectW - 8; x += 10) cv.circle(x, lowerY + 9, 1, 0xBBDDFF, 200);
    for (let x = 8; x < rectW - 8; x += 10) cv.circle(x, lowerY + 19, 1, 0xBBDDFF, 200);

    // dark waterline along the very bottom
    cv.rect(0, y0 + h - 8, rectW, 8, darken(hull2, 0.45), 255);

    // white upper decks — three rows of cabin windows
    for (let d = 0; d < 3; d++) {
      const dy = y0 + 2 + d * 8;
      for (let wx = 6; wx < rectW - 6; wx += 5) cv.rect(wx, dy + 2, 3, 3, 0x336688, 220);
    }
    // lifeboats slung below the boat deck
    for (let x = 8; x < rectW - 8; x += 16) cv.rect(x, y0 + 24, 8, 3, 0xFF7700, 220);

    // twin funnels, standing on the main deck
    const funnelH = Math.floor(extraTop * 0.65), funnelTop = y0 - funnelH;
    for (const fx of [Math.floor(rectW * 0.6), Math.floor(rectW * 0.72)]) {
      cv.rect(fx, funnelTop, 10, funnelH, darken(accent, 0.2), 255);
      cv.rect(fx, funnelTop, 10, 3, accent, 255);
    }
    // forward bridge, standing on the main deck near the bow
    const bridgeW = Math.floor(rectW * 0.18), bridgeH = Math.floor(extraTop * 0.5);
    const bridgeX = rectW - bridgeW - 10, bridgeTop = y0 - bridgeH;
    cv.rect(bridgeX, bridgeTop, bridgeW, bridgeH, 0xEEEEEE, 250);
    for (let wx = bridgeX + 2; wx < bridgeX + bridgeW - 2; wx += 3) cv.set(wx, bridgeTop + 2, 0x88CCFF, 220);

    // small pool deck between the funnels and the bridge
    const poolH = 8, poolW = Math.floor(rectW * 0.18), poolX = Math.floor(rectW * 0.4);
    cv.rect(poolX, y0 - poolH, poolW, poolH, 0x55AADD, 230);
  },
};

// ── Generate ────────────────────────────────────────────────────────────
for (const def of BOATS) {
  const extraTop = def.extraTop ?? 0;
  const texH = def.h + extraTop;
  const cv = new Canvas(def.w + TEX_PAD * 2, texH + TEX_PAD * 2);
  const ocv = new OffsetCanvas(cv, TEX_PAD, TEX_PAD);
  const y0 = extraTop;
  const rectW = def.w - def.bowW;

  drawHull(ocv, y0, def.w, def.h, rectW, def.hull);
  drawDeck(ocv, y0, rectW, def.h, def.hull);
  DETAILS[def.key](ocv, { ...def, y0, rectW });
  drawNavLights(ocv, y0, def.h, rectW, def.w);
  applyOutline(cv);

  const outPath = path.join(OUT_DIR, `${def.key}.png`);
  fs.writeFileSync(outPath, cv.toBuffer());
  console.log(`  wrote ${def.key}.png  ${cv.w}x${cv.h}`);
}
console.log(`Done. ${BOATS.length} boat textures written to ${OUT_DIR}`);
