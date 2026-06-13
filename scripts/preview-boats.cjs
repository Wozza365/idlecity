// Builds a scaled-up montage of assets/boats/*.png for visual review.
'use strict';
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, '..', 'assets', 'boats');
const SCALE = 8;
const PAD = 4;

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.png')).sort();
const imgs = files.map(f => PNG.sync.read(fs.readFileSync(path.join(DIR, f))));

const maxW = Math.max(...imgs.map(i => i.width)) * SCALE;
const totalH = imgs.reduce((s, i) => s + i.height * SCALE + PAD, PAD);

const out = new PNG({ width: maxW + PAD * 2, height: totalH });
out.data.fill(60); // dark gray bg
for (let i = 0; i < out.width * out.height; i++) out.data[i * 4 + 3] = 255;

let y = PAD;
for (const img of imgs) {
  for (let sy = 0; sy < img.height; sy++) {
    for (let sx = 0; sx < img.width; sx++) {
      const si = (sy * img.width + sx) * 4;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const ox = PAD + sx * SCALE + dx;
          const oy = y + sy * SCALE + dy;
          const oi = (oy * out.width + ox) * 4;
          const a = img.data[si + 3] / 255;
          for (let c = 0; c < 3; c++) {
            out.data[oi + c] = Math.round(img.data[si + c] * a + out.data[oi + c] * (1 - a));
          }
          out.data[oi + 3] = 255;
        }
      }
    }
  }
  y += img.height * SCALE + PAD;
}

fs.writeFileSync('/tmp/boats-preview.png', PNG.sync.write(out));
console.log('wrote /tmp/boats-preview.png', out.width, 'x', out.height);
