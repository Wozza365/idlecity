// Converts 4-bit palette-indexed PNGs in assets/cars/ to 8-bit RGBA.
// Phaser 4 / createImageBitmap can fail on palette PNGs in some browsers;
// RGBA avoids this entirely.
//
// Run once: node scripts/convert-car-pngs.js
'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const FOLDER = path.join(__dirname, '..', 'assets', 'cars');
const PNG_SIG = Buffer.from([137,80,78,71,13,10,26,10]);

// ── CRC-32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function writeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const crcIn   = Buffer.concat([typeBuf, data]);
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcIn));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Paeth predictor ──────────────────────────────────────────────────────────
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
}

// ── Reconstruct PNG filter ───────────────────────────────────────────────────
function reconstruct(raw, width, height, rowBytes) {
  const out = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const f    = raw[y * (rowBytes + 1)];
    const rOff = y * (rowBytes + 1) + 1;
    const oOff = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const a  = x > 0       ? out[oOff + x - 1]           : 0;
      const b  = y > 0       ? out[(y-1)*rowBytes + x]      : 0;
      const c  = (x > 0 && y > 0) ? out[(y-1)*rowBytes + x-1] : 0;
      const v  = raw[rOff + x];
      switch (f) {
        case 0: out[oOff+x] = v;                               break;
        case 1: out[oOff+x] = (v + a) & 0xFF;                 break;
        case 2: out[oOff+x] = (v + b) & 0xFF;                 break;
        case 3: out[oOff+x] = (v + ((a+b)>>1)) & 0xFF;        break;
        case 4: out[oOff+x] = (v + paeth(a,b,c)) & 0xFF;      break;
        default: out[oOff+x] = v;
      }
    }
  }
  return out;
}

// ── Convert one file ─────────────────────────────────────────────────────────
function convert(filePath) {
  const src = fs.readFileSync(filePath);

  // Parse chunks
  let pos = 8, width, height, bitDepth, colorType;
  const palette  = []; // [r,g,b,a]
  const idatBufs = [];

  while (pos + 12 <= src.length) {
    const len  = src.readUInt32BE(pos);
    const type = src.slice(pos+4, pos+8).toString('ascii');
    const data = src.slice(pos+8, pos+8+len);

    if (type === 'IHDR') {
      width     = data.readUInt32BE(0);
      height    = data.readUInt32BE(4);
      bitDepth  = data[8];
      colorType = data[9];
    } else if (type === 'PLTE') {
      for (let i = 0; i+2 < data.length; i += 3)
        palette.push([data[i], data[i+1], data[i+2], 255]);
    } else if (type === 'tRNS') {
      for (let i = 0; i < data.length && i < palette.length; i++)
        palette[i][3] = data[i];
    } else if (type === 'IDAT') {
      idatBufs.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  // Skip non-palette images (shouldn't happen in this folder, but be safe)
  if (colorType !== 3) {
    console.log('  skip (not palette):', path.basename(filePath));
    return;
  }

  // Reconstruct scanlines
  const rowBytes      = Math.ceil(width * bitDepth / 8);
  const compressed    = Buffer.concat(idatBufs);
  const raw           = zlib.inflateSync(compressed);
  const scanlines     = reconstruct(raw, width, height, rowBytes);

  // Expand palette indices → RGBA pixels
  const rgbaRows = Buffer.alloc(height * (width * 4 + 1)); // filter byte per row

  for (let y = 0; y < height; y++) {
    rgbaRows[y * (width*4+1)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      let idx;
      if (bitDepth === 4) {
        const b = scanlines[y * rowBytes + (x >> 1)];
        idx = (x & 1) ? (b & 0x0F) : (b >> 4);
      } else {
        idx = scanlines[y * rowBytes + x];
      }
      const [r,g,b,a] = palette[idx] || [0,0,0,0];
      const o = y*(width*4+1) + 1 + x*4;
      rgbaRows[o]=r; rgbaRows[o+1]=g; rgbaRows[o+2]=b; rgbaRows[o+3]=a;
    }
  }

  // Encode RGBA PNG
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8; // 8 bits per channel
  ihdr[9]  = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = zlib.deflateSync(rgbaRows, { level: 6 });

  const out = Buffer.concat([
    PNG_SIG,
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', idat),
    writeChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(filePath, out);
  console.log(`  converted: ${path.basename(filePath)}  ${width}x${height}  (${src.length}→${out.length} bytes)`);
}

// ── Run ──────────────────────────────────────────────────────────────────────
const files = fs.readdirSync(FOLDER).filter(f => f.endsWith('.png')).sort();
console.log(`Converting ${files.length} PNG files in ${FOLDER}...`);
let ok = 0, skip = 0;
for (const f of files) {
  try {
    convert(path.join(FOLDER, f));
    ok++;
  } catch (e) {
    console.error(`  ERROR ${f}:`, e.message);
    skip++;
  }
}
console.log(`Done. ${ok} converted, ${skip} skipped/errored.`);
