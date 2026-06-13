// Generates small pixel-art tree textures (assets/trees/*.png) to replace
// the procedurally-drawn (Graphics fillCircle/fillRect) verge trees in
// src/objects/VergeRiver.ts.
//
// Each canopy texture is a lumpy "leaf cluster" silhouette drawn in
// neutral grey/white tones so it can be recoloured at runtime via Phaser's
// setTint() (multiply mode) with the seasonally-lerped canopy colour —
// shaded (darker) areas render as a darker shade of the tint, the
// highlight patch renders close to the tint colour itself. Trunks follow
// the same convention, tinted with palette.treeTrunk.
//
// Run: node scripts/generate-tree-textures.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas } = require('./pixel-canvas.cjs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'trees');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PETAL     = 0xa0a0a0; // → base canopy / trunk tone
const SHADOW    = 0x707070; // → darker shaded side
const HIGHLIGHT = 0xe8e8e8; // → sunlit highlight patch

// Matches treeGeom() tiers in VergeRiver.ts
const TIERS = {
  small:  { canopyR: 11, trunkH: 18 },
  medium: { canopyR: 16, trunkH: 24 },
  large:  { canopyR: 21, trunkH: 30 },
};

function canopyTexture(r) {
  const lobeOffset = Math.round(r * 0.7);
  const lobeR      = Math.round(r * 0.6);
  const half = Math.ceil(lobeOffset + lobeR);
  const size = half * 2 + 2;
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const cv = new Canvas(size, size);

  // Main lobe plus 5 surrounding lobes arranged in a pentagon —
  // produces a lumpy "cluster of leaves" silhouette instead of a circle.
  const lobes = [{ dx: 0, dy: 0, r }];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    lobes.push({
      dx: Math.round(Math.cos(a) * lobeOffset),
      dy: Math.round(Math.sin(a) * lobeOffset),
      r: lobeR,
    });
  }

  const off = Math.max(1, Math.round(r * 0.12));
  for (const lobe of lobes) cv.circle(cx + lobe.dx + off, cy + lobe.dy + off, lobe.r, SHADOW);
  for (const lobe of lobes) cv.circle(cx + lobe.dx, cy + lobe.dy, lobe.r, PETAL);

  // Sunlit patch, upper-left
  cv.circle(cx - Math.round(r * 0.35), cy - Math.round(r * 0.35), Math.round(r * 0.55), HIGHLIGHT, 200);

  return cv;
}

function trunkTexture(trunkH) {
  const w = 8;
  const cv = new Canvas(w, trunkH);
  // Trunk core (4px wide, centred) with a left highlight and right shadow edge
  cv.rect(2, 0, 4, trunkH, PETAL);
  cv.rect(2, 0, 1, trunkH, HIGHLIGHT);
  cv.rect(5, 0, 1, trunkH, SHADOW);
  // Root flare — bottom rows widen to the full texture width
  cv.rect(1, trunkH - 4, 6, 4, SHADOW);
  return cv;
}

const outputs = [];
for (const [tier, { canopyR, trunkH }] of Object.entries(TIERS)) {
  outputs.push({ name: `canopy_${tier}`, cv: canopyTexture(canopyR) });
  outputs.push({ name: `trunk_${tier}`,  cv: trunkTexture(trunkH) });
}

for (const { name, cv } of outputs) {
  const outPath = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(outPath, cv.toBuffer());
  console.log(`  wrote ${name}.png  ${cv.w}x${cv.h}`);
}
console.log(`Done. ${outputs.length} tree textures written to ${OUT_DIR}`);
