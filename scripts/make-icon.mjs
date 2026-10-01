// Generates build/icon.png (512x512) and public/icon.png without any image library:
// a rounded indigo tile with a book cover (back | spine | front). Run: node scripts/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZE = 512;
const SS = 4; // supersampling for smooth edges

const inRoundRect = (x, y, rx, ry, w, h, r) => {
  if (x < rx || x > rx + w || y < ry || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// [x, y, w, h, radius, [r,g,b,a]] in 0..1 units, painted in order.
const shapes = [
  [0, 0, 1, 1, 0.22, [79, 70, 229, 255]],
  [0.17, 0.24, 0.3, 0.52, 0.02, [255, 255, 255, 115]],
  [0.47, 0.24, 0.08, 0.52, 0, [255, 255, 255, 190]],
  [0.55, 0.24, 0.28, 0.52, 0.02, [255, 255, 255, 255]],
];

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0; // filter: none
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / SIZE;
        const y = (py + (sy + 0.5) / SS) / SIZE;
        let pr = 0, pg = 0, pb = 0, pa = 0;
        for (const [rx, ry, w, h, rad, [sr, sg, sb, sa]] of shapes) {
          if (!inRoundRect(x, y, rx, ry, w, h, rad)) continue;
          const al = sa / 255;
          const outA = al + pa * (1 - al);
          pr = (sr * al + pr * pa * (1 - al)) / outA;
          pg = (sg * al + pg * pa * (1 - al)) / outA;
          pb = (sb * al + pb * pa * (1 - al)) / outA;
          pa = outA;
        }
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      }
    }
    const n = SS * SS;
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    raw[o] = a ? Math.round(r / a) : 0;
    raw[o + 1] = a ? Math.round(g / a) : 0;
    raw[o + 2] = a ? Math.round(b / a) : 0;
    raw[o + 3] = Math.round((a / n) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log(`wrote build/icon.png (${png.length} bytes)`);
