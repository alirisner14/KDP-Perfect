/**
 * Preflight: compare a finished cover file against what KDP expects for the book described by a
 * {@link CoverLayout}, and explain any mismatch.
 *
 * `readFileFacts` pulls the facts out of the bytes (PDF page size, image pixel size and declared DPI);
 * `runPreflight` is pure and compares those facts with the layout. Thresholds marked "app choice" are
 * ours: KDP does not publish a size tolerance.
 */

import { PDFDocument } from 'pdf-lib';
import { computeCoverLayout, type CoverLayout } from './cover';
import { HARDCOVER, getPaper } from './specs';
import { readJpegDpi, readPngDpi } from './render/raster-meta';
import { formatSize, round } from './units';

export type FileKind = 'pdf' | 'png' | 'jpg' | 'other';

export interface FileFacts {
  name: string;
  bytes: number;
  kind: FileKind;
  pdf?: { pages: number; widthIn: number; heightIn: number; cropBoxDiffers: boolean };
  /** For images the caller supplies the pixel size (e.g. from `createImageBitmap`). */
  raster?: { widthPx: number; heightPx: number; dpi: number | null };
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface Check {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
}

export interface PreflightResult {
  checks: Check[];
  verdict: 'pass' | 'warn' | 'fail';
  /** Things this tool cannot check, listed so nobody assumes they were. */
  notChecked: string[];
}

/** App choices: KDP publishes no tolerance. Within PASS the file is considered an exact match. */
export const SIZE_TOLERANCE = { pass: 0.005, warn: 0.03 } as const;
/** KDP asks for 300 DPI. Below WARN_BELOW we warn; below FAIL_BELOW the cover will visibly print soft. */
export const DPI_THRESHOLDS = { target: 300, warnBelow: 299, failBelow: 150 } as const;
const RATIO_TOLERANCE = { pass: 0.002, warn: 0.01 } as const;
const MB = 1024 * 1024;

export const NOT_CHECKED = [
  'Whether fonts are embedded in the PDF',
  'The resolution of images placed inside a PDF',
  'Color mode (RGB or CMYK) and transparency',
  'Whether text sits inside the safe zone (compare the overlay by eye)',
];

// --- Reading files ---------------------------------------------------------------------------

export function detectKind(bytes: Uint8Array): FileKind {
  const startsWith = (sig: number[]) => sig.every((v, i) => bytes[i] === v);
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'jpg';
  return 'other';
}

/** Facts that can be read without decoding pixels. For images, `raster` is filled in by the caller. */
export async function readFileFacts(name: string, bytes: Uint8Array): Promise<FileFacts> {
  const kind = detectKind(bytes);
  const facts: FileFacts = { name, bytes: bytes.byteLength, kind };
  if (kind === 'pdf') {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPageCount();
    if (pages > 0) {
      const page = doc.getPage(0);
      const media = page.getMediaBox();
      const crop = page.getCropBox();
      const rotated = page.getRotation().angle % 180 !== 0;
      const wPt = rotated ? media.height : media.width;
      const hPt = rotated ? media.width : media.height;
      const cropBoxDiffers = Math.abs(crop.width - media.width) > 0.5 || Math.abs(crop.height - media.height) > 0.5;
      facts.pdf = { pages, widthIn: wPt / 72, heightIn: hPt / 72, cropBoxDiffers };
    } else {
      facts.pdf = { pages: 0, widthIn: 0, heightIn: 0, cropBoxDiffers: false };
    }
  }
  return facts;
}

/** DPI declared inside a PNG or JPEG, or `null`. */
export function readDeclaredDpi(kind: FileKind, bytes: Uint8Array): number | null {
  if (kind === 'png') return readPngDpi(bytes);
  if (kind === 'jpg') return readJpegDpi(bytes);
  return null;
}

// --- Diagnosis -------------------------------------------------------------------------------

/** Guess why a file of `wIn` x `hIn` inches does not match the expected canvas. */
export function diagnoseSize(layout: CoverLayout, wIn: number, hIn: number): string | null {
  const tol = SIZE_TOLERANCE.warn;
  const { canvas, input } = layout;
  const near = (a: number, b: number) => Math.abs(a - b) <= tol;

  if (near(wIn, canvas.h) && near(hIn, canvas.w) && !near(wIn, canvas.w)) {
    return 'The file is rotated: its width and height are swapped.';
  }

  // Wrong binding? Compare with the other binding's canvas for the same book.
  const otherBinding = layout.binding === 'hardcover' ? 'paperback' : 'hardcover';
  const alt = computeCoverLayout({ ...input, binding: otherBinding });
  if (near(wIn, alt.canvas.w) && near(hIn, alt.canvas.h)) {
    return `These are the dimensions of a ${otherBinding} cover for this book. This book is set to ${layout.binding}.`;
  }

  if (layout.binding === 'paperback') {
    const noBleedW = canvas.w - 2 * layout.bleed;
    const noBleedH = canvas.h - 2 * layout.bleed;
    if (near(wIn, noBleedW) && near(hIn, noBleedH)) return `This looks like the cover trimmed to size with no bleed. Add ${layout.bleed}" of bleed on every edge.`;
    if (near(wIn, layout.panel.w + layout.bleed) && near(hIn, canvas.h)) return 'This looks like the front cover only. KDP needs the back cover, spine and front cover together on one page.';
  } else if (near(wIn, layout.panel.w) && near(hIn, layout.panel.h)) {
    return 'This looks like a single board with no wrap. Add the wrap around all four edges.';
  }

  // Right height, wrong width: the spine is a different thickness, so the page count is different.
  if (near(hIn, canvas.h) && !near(wIn, canvas.w)) {
    const paper = getPaper(input.paper);
    const addon = layout.binding === 'hardcover' ? HARDCOVER.spineAddon : 0;
    const spine = wIn - (canvas.w - layout.spineWidth);
    const pages = (spine - addon) / paper.thickness;
    if (spine > 0 && pages > 0 && pages < 1000) {
      return `The height is right but the width suggests a spine of ${round(spine, 3)}" (about ${Math.round(pages)} pages), not ${round(layout.spineWidth, 3)}" for ${input.pageCount} pages.`;
    }
  }
  return null;
}

// --- Checks ----------------------------------------------------------------------------------

const statusOrder: Record<CheckStatus, number> = { fail: 3, warn: 2, info: 1, pass: 0 };

function formatBytes(n: number): string {
  return n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function runPreflight(layout: CoverLayout, facts: FileFacts): PreflightResult {
  const checks: Check[] = [];
  const add = (id: string, status: CheckStatus, title: string, detail: string) => checks.push({ id, status, title, detail });
  const expected = formatSize(layout.canvas.w, layout.canvas.h, 'in');

  // 1. File type
  if (facts.kind === 'other') {
    add('type', 'fail', 'File type', 'This is not a PDF, PNG or JPG file, so it cannot be checked.');
  } else if (facts.kind === 'pdf') {
    add('type', 'pass', 'File type', 'PDF, the format KDP takes for print covers.');
  } else {
    add('type', 'warn', 'File type', `${facts.kind.toUpperCase()} image. KDP print covers are uploaded as a single PDF, so export your design to PDF before uploading. This image can still be checked for size and shape.`);
  }

  // 2. File size
  if (facts.bytes > 650 * MB) {
    add('filesize', 'fail', 'File size', `${formatBytes(facts.bytes)}. KDP can't convert files over 650 MB.`);
  } else if (facts.bytes > 40 * MB) {
    add('filesize', 'warn', 'File size', `${formatBytes(facts.bytes)}. Amazon recommends 40 MB or less.`);
  } else {
    add('filesize', 'pass', 'File size', formatBytes(facts.bytes));
  }

  // 3. Dimensions
  if (facts.pdf) {
    const { pages, widthIn, heightIn, cropBoxDiffers } = facts.pdf;
    if (pages !== 1) {
      add('pages', 'fail', 'Pages', `${pages === 0 ? 'No pages' : `${pages} pages`}. The cover must be a single page with the back, spine and front together.`);
    } else {
      add('pages', 'pass', 'Pages', 'One page.');
    }
    if (pages >= 1) {
      const dW = widthIn - layout.canvas.w;
      const dH = heightIn - layout.canvas.h;
      const worst = Math.max(Math.abs(dW), Math.abs(dH));
      const found = formatSize(widthIn, heightIn, 'in');
      const delta = `off by ${signed(dW)}" wide and ${signed(dH)}" tall`;
      if (worst <= SIZE_TOLERANCE.pass) {
        add('size', 'pass', 'Page size', `${found} matches the expected ${expected}.`);
      } else if (worst <= SIZE_TOLERANCE.warn) {
        add('size', 'warn', 'Page size', `${found} is close to the expected ${expected} (${delta}). Re-export at the exact size to be safe.`);
      } else {
        const why = diagnoseSize(layout, widthIn, heightIn);
        add('size', 'fail', 'Page size', `${found} but this book needs ${expected} (${delta}).${why ? ` ${why}` : ''}`);
      }
      if (cropBoxDiffers) add('cropbox', 'info', 'Crop box', 'The PDF has a crop box that differs from its page size. Make sure KDP sees the size you intend.');
    }
  } else if (facts.raster) {
    const { widthPx, heightPx, dpi } = facts.raster;
    const ratio = widthPx / heightPx;
    const expectedRatio = layout.canvas.w / layout.canvas.h;
    const rel = Math.abs(ratio - expectedRatio) / expectedRatio;
    const found = `${widthPx} x ${heightPx} px`;
    if (rel <= RATIO_TOLERANCE.pass) {
      add('size', 'pass', 'Shape', `${found} has the right proportions for ${expected}.`);
    } else if (rel <= RATIO_TOLERANCE.warn) {
      add('size', 'warn', 'Shape', `${found} is slightly off the expected proportions (${(rel * 100).toFixed(2)}% different). Re-export at the exact size.`);
    } else {
      const why = diagnoseSize(layout, ratio * layout.canvas.h, layout.canvas.h);
      add('size', 'fail', 'Shape', `${found} doesn't have the proportions of a ${expected} cover.${why ? ` ${why}` : ''}`);
    }

    const effective = widthPx / layout.canvas.w;
    const dpiText = `Spread over ${expected} this is ${Math.round(effective)} DPI (needs ${DPI_THRESHOLDS.target}).`;
    if (effective >= DPI_THRESHOLDS.warnBelow) {
      add('resolution', 'pass', 'Resolution', `${Math.round(effective)} DPI at full size.`);
    } else if (effective >= DPI_THRESHOLDS.failBelow) {
      add('resolution', 'warn', 'Resolution', `${dpiText} Text and fine lines may print soft. Export at ${Math.ceil(layout.canvas.w * DPI_THRESHOLDS.target)} x ${Math.ceil(layout.canvas.h * DPI_THRESHOLDS.target)} px.`);
    } else {
      add('resolution', 'fail', 'Resolution', `${dpiText} It will print visibly blurry. Export at ${Math.ceil(layout.canvas.w * DPI_THRESHOLDS.target)} x ${Math.ceil(layout.canvas.h * DPI_THRESHOLDS.target)} px.`);
    }

    if (dpi !== null) {
      const opensAt = formatSize(widthPx / dpi, heightPx / dpi, 'in');
      add('declared-dpi', 'info', 'Embedded DPI', `The file says ${dpi} DPI, so design tools open it at ${opensAt}.`);
    } else {
      add('declared-dpi', 'info', 'Embedded DPI', 'The file declares no DPI, so design tools may open it at 72 DPI (a huge page). That does not affect the pixels.');
    }
  }

  const worst = checks.reduce((m, c) => Math.max(m, statusOrder[c.status]), 0);
  const verdict = worst >= 3 ? 'fail' : worst === 2 ? 'warn' : 'pass';
  return { checks, verdict, notChecked: NOT_CHECKED };
}

function signed(v: number): string {
  const r = round(v, 3);
  return `${r > 0 ? '+' : ''}${r}`;
}
