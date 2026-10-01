/**
 * Stamp physical resolution (DPI) into encoded PNG / JPEG bytes.
 *
 * Browsers' `canvas.toBlob` writes no resolution, so design tools open the file at 72 DPI and
 * report the wrong physical size. Tagging the DPI makes a 3925 x 2775 px image open as
 * 13.08" x 9.25", i.e. actual size.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const readU32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

/** Insert (or replace) a `pHYs` chunk so the PNG declares `dpi` pixels per inch. */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 33 || PNG_SIGNATURE.some((v, i) => png[i] !== v)) throw new Error('Not a PNG file.');
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const type = [0x70, 0x48, 0x59, 0x73]; // "pHYs"
  const data = [...u32(pixelsPerMeter), ...u32(pixelsPerMeter), 1]; // unit 1 = metre
  const body = Uint8Array.from([...type, ...data]);
  const phys = Uint8Array.from([...u32(data.length), ...body, ...u32(crc32(body))]);

  let pos = 8;
  const chunks: Uint8Array[] = [png.subarray(0, 8)];
  let inserted = false;
  while (pos < png.length) {
    const length = readU32(png, pos);
    const name = String.fromCharCode(png[pos + 4]!, png[pos + 5]!, png[pos + 6]!, png[pos + 7]!);
    const end = pos + 12 + length;
    if (end > png.length) throw new Error('Truncated PNG.');
    if (name !== 'pHYs') chunks.push(png.subarray(pos, end));
    if (name === 'IHDR' && !inserted) {
      chunks.push(phys);
      inserted = true;
    }
    pos = end;
  }
  return concat(chunks);
}

/** Set the JFIF density of a JPEG to `dpi` (adds a JFIF header if the encoder wrote none). */
export function setJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG file.');
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  const isJfif =
    jpeg[2] === 0xff && jpeg[3] === 0xe0 && jpeg[6] === 0x4a && jpeg[7] === 0x46 && jpeg[8] === 0x49 && jpeg[9] === 0x46 && jpeg[10] === 0;
  if (isJfif) {
    const out = jpeg.slice();
    out[13] = 1; // units: dots per inch
    out[14] = d >> 8;
    out[15] = d & 255;
    out[16] = d >> 8;
    out[17] = d & 255;
    return out;
  }
  const app0 = Uint8Array.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, d >> 8, d & 255, d >> 8, d & 255, 0, 0]);
  return concat([jpeg.subarray(0, 2), app0, jpeg.subarray(2)]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
