/**
 * Loading uploaded cover artwork (PDF, PNG, JPG) into canvases, plus the small canvas utilities the
 * preflight and mockup screens share. Runs in the renderer only (needs the DOM).
 */

import { detectKind, readDeclaredDpi, readFileFacts, type FileFacts, type FileKind } from '../core/preflight';
import { drawScene } from '../core/render/canvas';
import type { Scene } from '../core/scene';
import type { UvRect } from '../core/mockup';

export interface Artwork {
  name: string;
  kind: FileKind;
  bytes: Uint8Array;
  /** First page / image, drawn at up to `maxSide` pixels on its longest side. */
  canvas: HTMLCanvasElement;
  facts: FileFacts;
}

export const MAX_UPLOAD_BYTES = 700 * 1024 * 1024;

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | undefined;

/** pdf.js is large, so it is only fetched when a PDF is first opened. */
function getPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    return pdfjs;
  })();
  return pdfjsPromise;
}

export function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

async function renderPdfFirstPage(bytes: Uint8Array, maxSide: number): Promise<HTMLCanvasElement> {
  const pdfjs = await getPdfjs();
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxSide / Math.max(base.width, base.height), 8);
    const viewport = page.getViewport({ scale });
    const canvas = newCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    return canvas;
  } finally {
    await task.destroy();
  }
}

/** Decode an uploaded file into a canvas plus the facts preflight needs. Throws a readable Error on failure. */
export async function loadArtwork(file: File, maxSide = 4096): Promise<Artwork> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That file is over 700 MB, more than KDP can convert.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectKind(bytes);
  if (kind === 'other') throw new Error('Please choose a PDF, PNG or JPG file.');

  const facts = await readFileFacts(file.name, bytes).catch(() => {
    throw new Error('That PDF could not be read. It may be damaged or password-protected.');
  });

  if (kind === 'pdf') {
    if (!facts.pdf || facts.pdf.pages < 1) throw new Error('That PDF has no pages.');
    const canvas = await renderPdfFirstPage(bytes, maxSide).catch((err) => {
      console.error(err);
      throw new Error('That PDF could not be drawn. It may be damaged or use features this viewer does not support.');
    });
    return { name: file.name, kind, bytes, canvas, facts };
  }

  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart])).catch(() => {
    throw new Error('That image could not be opened.');
  });
  facts.raster = { widthPx: bitmap.width, heightPx: bitmap.height, dpi: readDeclaredDpi(kind, bytes) };
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = newCanvas(bitmap.width * k, bitmap.height * k);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { name: file.name, kind, bytes, canvas, facts };
}

/** Draw a scene to a new canvas at `pxPerInch`. */
export function sceneToCanvas(scene: Scene, pxPerInch: number): HTMLCanvasElement {
  const canvas = newCanvas(scene.width * pxPerInch, scene.height * pxPerInch);
  drawScene(canvas.getContext('2d')!, scene, pxPerInch);
  return canvas;
}

/** Crop a fractional region out of an image, capping the output's longest side at `maxSide`. */
export function cropRegion(src: HTMLCanvasElement, r: UvRect, maxSide = 2048): HTMLCanvasElement {
  const sx = r.x * src.width;
  const sy = r.y * src.height;
  const sw = Math.max(1, r.w * src.width);
  const sh = Math.max(1, r.h * src.height);
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const out = newCanvas(sw * k, sh * k);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** Centre-crop an image to a width/height ratio (CSS "cover" behaviour), capping the longest side. */
export function coverFit(src: HTMLCanvasElement, aspect: number, maxSide = 2048): HTMLCanvasElement {
  const srcAspect = src.width / src.height;
  let sw = src.width;
  let sh = src.height;
  if (srcAspect > aspect) sw = src.height * aspect;
  else sh = src.width / aspect;
  const sx = (src.width - sw) / 2;
  const sy = (src.height - sh) / 2;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const out = newCanvas(sw * k, sh * k);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** Average colour of a region (fractions of the canvas), as `#rrggbb`. */
export function averageColor(src: HTMLCanvasElement, r: UvRect): string {
  const probe = newCanvas(8, 8);
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, r.x * src.width, r.y * src.height, Math.max(1, r.w * src.width), Math.max(1, r.h * src.height), 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let R = 0;
  let G = 0;
  let B = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    R += d[i]!;
    G += d[i + 1]!;
    B += d[i + 2]!;
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(R)}${hex(G)}${hex(B)}`;
}

/** Multiply a `#rrggbb` colour's brightness by `k` (0..1 darkens, >1 lightens, capped). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}
