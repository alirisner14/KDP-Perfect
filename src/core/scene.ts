/**
 * Renderer-agnostic drawing description of the cover template.
 *
 * `buildCoverScene` turns a {@link CoverLayout} into a flat list of primitives (rects, lines, text)
 * in inches, y-down. The SVG, PNG (canvas) and PDF renderers each walk this same list, so every
 * export is guaranteed to show exactly the same guides.
 */

import { BARCODE, BLEED, SPINE_MARGIN, SPINE_TEXT_MIN_PAGES, getPaper } from './specs';
import type { CoverLayout, Rect } from './cover';
import { formatLength, formatNumber, formatSize, toPixels } from './units';

export type Dash = readonly [number, number];

export type Primitive =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      fillOpacity?: number;
      stroke?: string;
      strokeWidth?: number;
      dash?: Dash;
    }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; dash?: Dash }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      /** Font size in inches. */
      size: number;
      fill: string;
      anchor: 'start' | 'middle' | 'end';
      bold?: boolean;
      /** Degrees clockwise about (x, y). */
      rotate?: number;
    };

export interface Scene {
  /** Canvas size in inches. */
  width: number;
  height: number;
  /** Solid background colour, or `null` for a transparent canvas. */
  background: string | null;
  items: Primitive[];
}

export type SceneMode = 'template' | 'overlay';

export interface SceneOptions {
  /**
   * `template`: white page, tinted zones and labels (the full guide).
   * `overlay`: transparent page, lines and light tints only, to lay over artwork.
   */
  mode: SceneMode;
  /** Used only for the pixel size printed on the template. */
  dpi: number;
}

// --- Palette ---------------------------------------------------------------------------------

export const COLORS = {
  bleed: '#E5484D',
  variance: '#F5A524',
  safe: '#1F9D68',
  spineText: '#2F6FED',
  trim: '#1A1A1A',
  fold: '#8E4EC6',
  barcode: '#4B4B4B',
  label: '#3A3A3A',
  muted: '#7A7A7A',
  page: '#FFFFFF',
} as const;

const DASH: Dash = [0.07, 0.045];
const LINE = 0.012;

// --- Helpers ---------------------------------------------------------------------------------

/** Four non-overlapping strips covering `outer` minus `inner` (inner must lie inside outer). */
function frame(outer: Rect, inner: Rect): Rect[] {
  const strips: Rect[] = [
    { x: outer.x, y: outer.y, w: outer.w, h: inner.y - outer.y },
    { x: outer.x, y: inner.y + inner.h, w: outer.w, h: outer.y + outer.h - (inner.y + inner.h) },
    { x: outer.x, y: inner.y, w: inner.x - outer.x, h: inner.h },
    { x: inner.x + inner.w, y: inner.y, w: outer.x + outer.w - (inner.x + inner.w), h: inner.h },
  ];
  return strips.filter((r) => r.w > 1e-6 && r.h > 1e-6);
}

/** Rough text width (inches). Good enough for fitting labels; the PDF renderer measures exactly. */
export function estimateTextWidth(text: string, size: number, bold = false): number {
  return text.length * size * (bold ? 0.6 : 0.55);
}

function fitSize(text: string, maxWidth: number, maxSize: number, minSize: number, bold = false): number {
  const fit = maxWidth / (text.length * (bold ? 0.6 : 0.55));
  return Math.max(minSize, Math.min(maxSize, fit));
}

const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

// --- Builder ---------------------------------------------------------------------------------

export function buildCoverScene(layout: CoverLayout, options: SceneOptions): Scene {
  const template = options.mode === 'template';
  const tint = template ? 1 : 0.75;
  const { canvas, trim, back, spine, front, safe } = layout;
  const items: Primitive[] = [];
  const fillRect = (r: Rect, color: string, opacity: number) =>
    items.push({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, fill: color, fillOpacity: opacity });

  // 1. Bleed band: everything outside the trim line gets trimmed off.
  const canvasRect: Rect = { x: 0, y: 0, w: canvas.w, h: canvas.h };
  frame(canvasRect, trim).forEach((r) => fillRect(r, COLORS.bleed, 0.3 * tint));

  // 2. Trim-variance bands: inside the trim line but outside the safe boxes.
  frame(back, safe.back).forEach((r) => fillRect(r, COLORS.variance, 0.3 * tint));
  frame(front, safe.front).forEach((r) => fillRect(r, COLORS.variance, 0.3 * tint));
  if (safe.spineText) frame(spine, safe.spineText).forEach((r) => fillRect(r, COLORS.variance, 0.3 * tint));
  else fillRect(spine, COLORS.variance, 0.3 * tint); // no spine text allowed: keep the whole spine clear

  // 3. Safe areas (light tint + dashed outline).
  for (const r of [safe.back, safe.front]) {
    if (template) fillRect(r, COLORS.safe, 0.06);
    items.push({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, stroke: COLORS.safe, strokeWidth: LINE, dash: DASH });
  }
  if (safe.spineText) {
    const r = safe.spineText;
    fillRect(r, COLORS.spineText, 0.14 * tint);
    items.push({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, stroke: COLORS.spineText, strokeWidth: LINE, dash: DASH });
  }

  // 4. Barcode box KDP overlays on the back cover.
  const bc = layout.barcode;
  items.push({
    kind: 'rect',
    x: bc.x,
    y: bc.y,
    w: bc.w,
    h: bc.h,
    fill: COLORS.page,
    fillOpacity: template ? 0.9 : 0.55,
    stroke: COLORS.barcode,
    strokeWidth: LINE,
    dash: DASH,
  });

  // 5. Trim line (outer) and spine folds.
  items.push({ kind: 'rect', x: trim.x, y: trim.y, w: trim.w, h: trim.h, stroke: COLORS.trim, strokeWidth: LINE, dash: DASH });
  for (const x of [spine.x, spine.x + spine.w]) {
    items.push({ kind: 'line', x1: x, y1: 0, x2: x, y2: canvas.h, stroke: COLORS.fold, strokeWidth: LINE, dash: [0.12, 0.05] });
  }

  if (template) addLabels(items, layout, options);

  return { width: canvas.w, height: canvas.h, background: template ? COLORS.page : null, items };
}

// --- Labels (template mode) ------------------------------------------------------------------

function addLabels(items: Primitive[], layout: CoverLayout, options: SceneOptions): void {
  const { safe, barcode, canvas, input } = layout;
  const paper = getPaper(input.paper);
  const trimSize = formatSize(input.trimWidth, input.trimHeight, 'in');

  // Panel names, centered high in each safe box.
  const panelTitle = (safeBox: Rect, name: string, sub: string) => {
    const size = fitSize(name, safeBox.w * 0.8, 0.5, 0.18, true);
    const y = safeBox.y + 0.25 + size;
    items.push({ kind: 'text', x: cx(safeBox), y, text: name, size, fill: COLORS.muted, anchor: 'middle', bold: true });
    const subSize = fitSize(sub, safeBox.w * 0.85, 0.16, 0.09);
    items.push({ kind: 'text', x: cx(safeBox), y: y + subSize * 1.7, text: sub, size: subSize, fill: COLORS.muted, anchor: 'middle' });
    return y + subSize * 1.7;
  };
  panelTitle(safe.front, 'FRONT COVER', `trim ${trimSize}`);
  const backBottom = panelTitle(safe.back, 'BACK COVER', `trim ${trimSize}`);

  // Dimension block on the back cover. This is what you type into your design tool.
  const wPx = toPixels(canvas.w, options.dpi);
  const hPx = toPixels(canvas.h, options.dpi);
  const spineText = layout.spineTextAllowed
    ? `text zone ${formatLength(layout.spineTextWidth, 'in')}`
    : `no spine text (< ${SPINE_TEXT_MIN_PAGES} pages)`;
  const lines: { text: string; scale: number; bold?: boolean; fill?: string }[] = [
    { text: 'CANVAS SIZE', scale: 0.8, bold: true, fill: COLORS.muted },
    { text: formatSize(canvas.w, canvas.h, 'in'), scale: 1.5, bold: true },
    { text: formatSize(canvas.w, canvas.h, 'cm'), scale: 1.05 },
    { text: formatSize(canvas.w, canvas.h, 'mm'), scale: 1.05 },
    { text: `${wPx} x ${hPx} px at ${options.dpi} DPI`, scale: 1.05 },
    { text: ' ', scale: 0.6 },
    { text: `Bleed ${formatLength(BLEED, 'in')} on every outer edge`, scale: 0.9 },
    { text: `Spine ${formatLength(layout.spineWidth, 'in')} (${spineText})`, scale: 0.9 },
    { text: `Each cover trims to ${trimSize}`, scale: 0.9 },
    { text: `${input.pageCount} pages, ${paper.label.toLowerCase()}`, scale: 0.9 },
    { text: `Safe zone: ${formatLength(layout.safeMargin, 'in')} in from the canvas edge`, scale: 0.9 },
  ];
  const longest = lines.reduce((a, l) => (l.text.length * l.scale > a.text.length * a.scale ? l : a), lines[0]!);
  const maxW = safe.back.w - 0.4;
  const base = fitSize(longest.text, maxW, 0.17 / longest.scale, 0.07 / longest.scale, longest.bold);
  let y = backBottom + 0.3;
  const x = cx(safe.back);
  const limit = barcode.y - 0.15;
  for (const l of lines) {
    const size = base * l.scale;
    y += size * 1.45;
    if (y > limit) break; // never run into the barcode box
    items.push({ kind: 'text', x, y, text: l.text, size, fill: l.fill ?? COLORS.label, anchor: 'middle', bold: l.bold });
  }

  // Barcode caption.
  const bcSize = 0.1;
  items.push({
    kind: 'text',
    x: cx(barcode),
    y: cy(barcode) - bcSize * 0.2,
    text: 'BARCODE AREA',
    size: bcSize * 1.2,
    fill: COLORS.barcode,
    anchor: 'middle',
    bold: true,
  });
  items.push({
    kind: 'text',
    x: cx(barcode),
    y: cy(barcode) + bcSize * 1.4,
    text: `${formatNumber(BARCODE.width, 'in')}" x ${formatNumber(BARCODE.height, 'in')}" - keep clear`,
    size: bcSize,
    fill: COLORS.barcode,
    anchor: 'middle',
  });

  addSpineLabel(items, layout);
  addLegend(items, layout);
}

function addSpineLabel(items: Primitive[], layout: CoverLayout): void {
  const { spine, safe } = layout;
  const label = layout.spineTextAllowed
    ? `SPINE TEXT ZONE  ${formatLength(layout.spineWidth, 'in')} wide`
    : `NO SPINE TEXT (under ${SPINE_TEXT_MIN_PAGES} pages)  ${formatLength(layout.spineWidth, 'in')} wide`;
  // Text runs top-to-bottom (rotated 90 degrees clockwise), the usual spine orientation.
  const zone = safe.spineText ?? spine;
  const size = Math.min(0.2, (layout.spineTextAllowed ? safe.spineText!.w : spine.w) * 0.62);
  if (size < 0.045) return; // spine too thin to carry a readable label
  const fitted = Math.min(size, (zone.h * 0.9) / (label.length * 0.58));
  items.push({
    kind: 'text',
    x: cx(spine) + fitted * 0.35,
    y: cy(spine),
    text: label,
    size: fitted,
    fill: layout.spineTextAllowed ? COLORS.spineText : COLORS.muted,
    anchor: 'middle',
    bold: true,
    rotate: 90,
  });
}

/** Colour key along the bottom of the front cover's safe area. */
function addLegend(items: Primitive[], layout: CoverLayout): void {
  const { safe } = layout;
  const entries: { color: string; label: string; swatch: 'fill' | 'line' }[] = [
    { color: COLORS.bleed, label: 'Bleed: extend artwork here (trimmed off)', swatch: 'fill' },
    { color: COLORS.variance, label: 'Trim variance: keep text out', swatch: 'fill' },
    { color: COLORS.safe, label: 'Safe zone: text and key art', swatch: 'line' },
    { color: COLORS.spineText, label: `Spine text zone (${formatLength(SPINE_MARGIN, 'in')} from folds)`, swatch: 'line' },
    { color: COLORS.trim, label: 'Trim line (cut here)', swatch: 'line' },
    { color: COLORS.fold, label: 'Spine fold', swatch: 'line' },
  ];
  const box = safe.front;
  const longest = Math.max(...entries.map((e) => e.label.length));
  const size = fitSize('x'.repeat(longest), box.w - 0.7, 0.13, 0.065);
  const rowH = size * 1.7;
  let y = box.y + box.h - 0.2 - rowH * (entries.length - 1);
  const x0 = box.x + 0.25;
  for (const e of entries) {
    if (e.swatch === 'fill') {
      items.push({ kind: 'rect', x: x0, y: y - size * 0.85, w: 0.3, h: size, fill: e.color, fillOpacity: 0.45, stroke: e.color, strokeWidth: 0.006 });
    } else {
      items.push({ kind: 'line', x1: x0, y1: y - size * 0.35, x2: x0 + 0.3, y2: y - size * 0.35, stroke: e.color, strokeWidth: LINE * 1.3, dash: [0.06, 0.035] });
    }
    items.push({ kind: 'text', x: x0 + 0.4, y, text: e.label, size, fill: COLORS.label, anchor: 'start' });
    y += rowH;
  }
}
