/** Drawing description of the Kindle eBook cover template (see ebook.ts). Shares the scene renderers. */

import { EBOOK, type EbookLayout } from './ebook';
import { COLORS, type Primitive, type Scene, type SceneOptions } from './scene';

/** Suggested text margin as a fraction of the width. KDP publishes no margin; this is a design aid only. */
const MARGIN_FRACTION = 0.06;

export function buildEbookScene(layout: EbookLayout, options: SceneOptions): Scene {
  const template = options.mode === 'template';
  const { width: w, height: h } = layout;
  const px = 1 / EBOOK.dpi; // one pixel, in inches
  const items: Primitive[] = [];

  // Border guide: KDP suggests 3-4 px medium gray on white/light covers.
  const b = EBOOK.borderPx[1] * px;
  const border = '#8A8F98';
  for (const r of [
    { x: 0, y: 0, w, h: b },
    { x: 0, y: h - b, w, h: b },
    { x: 0, y: b, w: b, h: h - 2 * b },
    { x: w - b, y: b, w: b, h: h - 2 * b },
  ]) {
    items.push({ kind: 'rect', ...r, fill: border, fillOpacity: template ? 0.55 : 0.75 });
  }

  // Suggested margin.
  const m = w * MARGIN_FRACTION;
  const line = Math.max(0.012, w * 0.002);
  items.push({ kind: 'rect', x: m, y: m, w: w - 2 * m, h: h - 2 * m, stroke: COLORS.safe, strokeWidth: line, dash: [w * 0.02, w * 0.012] });

  // Center lines.
  const dash = [w * 0.012, w * 0.012] as const;
  items.push({ kind: 'line', x1: w / 2, y1: 0, x2: w / 2, y2: h, stroke: COLORS.muted, strokeWidth: line * 0.7, dash });
  items.push({ kind: 'line', x1: 0, y1: h / 2, x2: w, y2: h / 2, stroke: COLORS.muted, strokeWidth: line * 0.7, dash });

  if (template) {
    const text = (t: string, y: number, size: number, fill: string, bold = false) =>
      items.push({ kind: 'text', x: w / 2, y, text: t, size, fill, anchor: 'middle', bold });
    const fit = (t: string, max: number, bold = false) => Math.min(max, ((w - 2 * m) * 0.84) / (t.length * (bold ? 0.6 : 0.55)));

    const title = 'KINDLE EBOOK COVER';
    const sizeText = `${layout.widthPx} x ${layout.heightPx} px`;
    const ratioText = `ratio ${layout.ratio}:1 (KDP ideal 1.6:1)`;
    const lines = ['Include the title and author', 'No spine, barcode, back cover,', 'prices or promotional text', `Keep text inside the green margin`];

    let y = h * 0.34;
    const t1 = fit(title, w * 0.09, true);
    text(title, y, t1, COLORS.muted, true);
    y += t1 * 1.9;
    const t2 = fit(sizeText, w * 0.12, true);
    text(sizeText, y, t2, COLORS.label, true);
    y += t2 * 1.5;
    const t3 = fit(ratioText, w * 0.05);
    text(ratioText, y, t3, COLORS.label);
    y += t3 * 1.6;
    text(`${EBOOK.dpi} DPI, RGB, JPEG preferred, under 50 MB`, y, fit(`${EBOOK.dpi} DPI, RGB, JPEG preferred, under 50 MB`, w * 0.045), COLORS.label);
    y += t3 * 3;
    for (const l of lines) {
      const s = fit(l, w * 0.04);
      text(l, y, s, COLORS.muted);
      y += s * 1.6;
    }

    const cap = 'Gray edge = 3-4 px border guide for white or light covers';
    const cs = fit(cap, w * 0.032);
    text(cap, h - m - cs * 0.8, cs, COLORS.muted);
    const cap2 = 'Green dashed = suggested text margin (not a KDP rule)';
    text(cap2, h - m - cs * 2.6, cs, COLORS.safe);
  }

  return { width: w, height: h, background: template ? COLORS.page : null, items };
}
