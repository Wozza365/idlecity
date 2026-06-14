#!/usr/bin/env node
// Erases the static flag pixels from cruise_ship.png.
// Run once: node scripts/erase-cruise-flag.cjs
const { PNG } = require('pngjs');
const fs      = require('fs');
const path    = require('path');

const FILE = path.join(__dirname, '../assets/boats/cruise_ship.png');
const data = fs.readFileSync(FILE);
const png  = PNG.sync.read(data);
const { width, height, data: px } = png;

console.log(`cruise_ship.png: ${width}x${height}`);

// Scan the known flag region to understand what's there
const X0 = 245, X1 = 272, Y0 = 62, Y1 = 90;
let erased = 0;

for (let y = Y0; y <= Y1; y++) {
  for (let x = X0; x <= X1; x++) {
    const i = (y * width + x) * 4;
    if (px[i + 3] < 10) continue; // already transparent
    const r = px[i], g = px[i + 1], b = px[i + 2];
    // Flag pixels are golden/yellow: high R, moderate-high G, low B.
    // Ship hull pixels in this area are dark grey.
    const isGolden = r > 90 && g > 70 && b < 90;
    if (isGolden) {
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
      erased++;
    }
  }
}

console.log(`Erased ${erased} flag pixels in region x=${X0}-${X1}, y=${Y0}-${Y1}`);
fs.writeFileSync(FILE, PNG.sync.write(png));
console.log('Done. Check assets/boats/cruise_ship.png');
