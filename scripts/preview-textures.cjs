// Dev-only helper: combines a set of PNGs into one upscaled preview sheet so
// they can be visually inspected. Not part of the asset pipeline.
'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const files = process.argv.slice(2);
const SCALE = 8;
const PAD = 4;

const imgs = files.map(f => PNG.sync.read(fs.readFileSync(f)));
const totalW = imgs.reduce((s, im) => s + im.width * SCALE + PAD, PAD);
const maxH = Math.max(...imgs.map(im => im.height * SCALE)) + PAD * 2;

const out = new PNG({ width: totalW, height: maxH });
// fill background (mid grey checkerboard for alpha visibility)
for (let y = 0; y < maxH; y++) {
  for (let x = 0; x < totalW; x++) {
    const i = (y * totalW + x) * 4;
    const c = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0) ? 60 : 90;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = c;
    out.data[i + 3] = 255;
  }
}

let xOff = PAD;
for (const im of imgs) {
  for (let y = 0; y < im.height; y++) {
    for (let x = 0; x < im.width; x++) {
      const si = (y * im.width + x) * 4;
      const a = im.data[si + 3];
      if (a === 0) continue;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const dx = xOff + x * SCALE + sx;
          const dy = PAD + y * SCALE + sy;
          const di = (dy * totalW + dx) * 4;
          const sr = im.data[si], sg = im.data[si + 1], sb = im.data[si + 2];
          const t = a / 255, it = 1 - t;
          out.data[di]     = Math.round(sr * t + out.data[di] * it);
          out.data[di + 1] = Math.round(sg * t + out.data[di + 1] * it);
          out.data[di + 2] = Math.round(sb * t + out.data[di + 2] * it);
          out.data[di + 3] = 255;
        }
      }
    }
  }
  xOff += im.width * SCALE + PAD;
}

const outPath = path.join(__dirname, '..', '_preview.png');
fs.writeFileSync(outPath, PNG.sync.write(out));
console.log('wrote', outPath, totalW + 'x' + maxH);
