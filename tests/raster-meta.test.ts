import { describe, expect, it } from 'vitest';
import { setJpegDpi, setPngDpi } from '../src/core/render/raster-meta';

// 1x1 transparent PNG (67 bytes) with no pHYs chunk.
const PNG_1x1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunks(png: Uint8Array) {
  const out: { name: string; start: number; length: number }[] = [];
  let pos = 8;
  while (pos < png.length) {
    const length = u32(png, pos);
    out.push({ name: ascii(png, pos + 4, 4), start: pos, length });
    pos += 12 + length;
  }
  return out;
}

describe('setPngDpi', () => {
  it('inserts a valid pHYs chunk right after IHDR', () => {
    const out = setPngDpi(PNG_1x1, 300);
    const list = chunks(out);
    expect(list.map((c) => c.name)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    const phys = list[1]!;
    const dataStart = phys.start + 8;
    expect(phys.length).toBe(9);
    expect(u32(out, dataStart)).toBe(11811); // 300 DPI in pixels per metre
    expect(u32(out, dataStart + 4)).toBe(11811);
    expect(out[dataStart + 8]).toBe(1); // unit: metre
    // CRC covers type + data
    expect(u32(out, dataStart + 9)).toBe(crc32(out.subarray(phys.start + 4, dataStart + 9)));
  });

  it('replaces an existing pHYs chunk instead of duplicating it', () => {
    const twice = setPngDpi(setPngDpi(PNG_1x1, 72), 150);
    expect(chunks(twice).filter((c) => c.name === 'pHYs')).toHaveLength(1);
    expect(u32(twice, chunks(twice)[1]!.start + 8)).toBe(5906); // 150 DPI
  });

  it('keeps the rest of the image untouched', () => {
    const out = setPngDpi(PNG_1x1, 300);
    expect(out.length).toBe(PNG_1x1.length + 21);
  });

  it('rejects non-PNG input', () => {
    expect(() => setPngDpi(new Uint8Array(40), 300)).toThrow('Not a PNG');
  });
});

describe('setJpegDpi', () => {
  const jfif = (units: number, x: number, y: number) =>
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, units, x >> 8, x & 255, y >> 8, y & 255, 0, 0, 0xff, 0xd9]);

  it('patches the density of an existing JFIF header', () => {
    const out = setJpegDpi(jfif(0, 1, 1), 300);
    expect([...out.subarray(13, 18)]).toEqual([1, 1, 44, 1, 44]); // 300 = 0x012C
    expect(out.length).toBe(22);
  });

  it('adds a JFIF header when the encoder wrote none', () => {
    const bare = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 2, 0xff, 0xd9]);
    const out = setJpegDpi(bare, 150);
    expect([...out.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(ascii(out, 6, 4)).toBe('JFIF');
    expect([...out.subarray(13, 18)]).toEqual([1, 0, 150, 0, 150]);
    expect([...out.subarray(20, 22)]).toEqual([0xff, 0xdb]); // original data follows
  });

  it('rejects non-JPEG input', () => {
    expect(() => setJpegDpi(Uint8Array.from([1, 2, 3, 4]), 300)).toThrow('Not a JPEG');
  });
});
