/**
 * Kindle eBook cover (the "marketing cover" image shown on Amazon and on Kindle devices).
 *
 * Source: KDP help pages "Cover Image Guidelines for Kindle eBooks" and "What criteria does my eBook's
 * cover image need to meet?" (checked 2026-10-29). docs/KDP-SPECS.md lists the figures and where the
 * two pages differ. An eBook cover is a single front image: no spine, back cover or barcode, and no bleed.
 *
 * Unlike print covers this is specified in PIXELS. The template is drawn in inches at 300 DPI so it can
 * share the scene renderers: `widthPx / 300` inches renders to exactly `widthPx` pixels at 300 DPI.
 */

import type { LayoutWarning } from './cover';
import { round } from './units';

export const EBOOK = {
  /** Ideal size: 2,560 px high x 1,600 px wide (ratio 1.6:1). */
  idealWidth: 1600,
  idealHeight: 2560,
  /** For best quality on high-definition devices KDP also names 2,500 px high. */
  hdWidth: 1563,
  hdHeight: 2500,
  /** Smallest size KDP's criteria page accepts. */
  minWidth: 625,
  minHeight: 1000,
  /** Marketing-cover hard floor: 500 px on the longest side. Maximum 10,000 px on each side. */
  minLongestSide: 500,
  maxSide: 10_000,
  /** Height / width should be at least this (1.6:1). */
  minRatio: 1.6,
  maxBytes: 50 * 1024 * 1024,
  /** Recommended resolution; also the DPI the template is drawn and tagged at. */
  dpi: 300,
  /** White or very light covers: KDP suggests a narrow medium-gray border of this many pixels. */
  borderPx: [3, 4] as const,
} as const;

export interface EbookInput {
  widthPx: number;
  heightPx: number;
}

export interface EbookLayout {
  input: EbookInput;
  widthPx: number;
  heightPx: number;
  /** Size in inches at 300 DPI (what the scene uses). */
  width: number;
  height: number;
  ratio: number;
  warnings: LayoutWarning[];
  valid: boolean;
}

export const EBOOK_PRESETS = [
  { id: 'ideal', label: `Ideal: ${EBOOK.idealWidth} x ${EBOOK.idealHeight} px`, widthPx: EBOOK.idealWidth, heightPx: EBOOK.idealHeight },
  { id: 'hd', label: `HD devices: ${EBOOK.hdWidth} x ${EBOOK.hdHeight} px`, widthPx: EBOOK.hdWidth, heightPx: EBOOK.hdHeight },
  { id: 'min', label: `Minimum: ${EBOOK.minWidth} x ${EBOOK.minHeight} px`, widthPx: EBOOK.minWidth, heightPx: EBOOK.minHeight },
] as const;

export function computeEbookLayout(input: EbookInput): EbookLayout {
  const { widthPx: w, heightPx: h } = input;
  const warnings: LayoutWarning[] = [];

  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    warnings.push({ level: 'error', code: 'size-invalid', message: 'Enter the width and height as whole numbers of pixels.' });
  } else {
    if (Math.max(w, h) < EBOOK.minLongestSide) {
      warnings.push({ level: 'error', code: 'too-small', message: `The longest side must be at least ${EBOOK.minLongestSide} px or Amazon won't display the cover.` });
    }
    if (w > EBOOK.maxSide || h > EBOOK.maxSide) {
      warnings.push({ level: 'error', code: 'too-large', message: `Each side must be ${EBOOK.maxSide.toLocaleString('en-US')} px or less.` });
    }
    if (h / w < EBOOK.minRatio) {
      warnings.push({
        level: 'warning',
        code: 'ratio',
        message: `KDP asks for a height/width ratio of at least ${EBOOK.minRatio}:1 (yours is ${round(h / w, 2)}:1). The ideal is ${EBOOK.idealWidth} x ${EBOOK.idealHeight} px.`,
      });
    }
    if (w < EBOOK.minWidth || h < EBOOK.minHeight) {
      warnings.push({ level: 'warning', code: 'below-minimum', message: `KDP's criteria list ${EBOOK.minWidth} x ${EBOOK.minHeight} px as the minimum.` });
    } else if (w < EBOOK.idealWidth || h < EBOOK.idealHeight) {
      warnings.push({
        level: 'info',
        code: 'below-ideal',
        message: `Below the ideal ${EBOOK.idealWidth} x ${EBOOK.idealHeight} px. KDP accepts it but shows a warning at upload; don't stretch a smaller image to fit.`,
      });
    }
  }

  const valid = !warnings.some((x) => x.level === 'error');
  const width = valid ? w / EBOOK.dpi : 0;
  const height = valid ? h / EBOOK.dpi : 0;
  return { input, widthPx: w, heightPx: h, width, height, ratio: valid ? round(h / w, 4) : 0, warnings, valid };
}

/** `kdp-ebook-cover-template_1600x2560px.jpg` */
export function ebookFileName(layout: EbookLayout, variant: 'template' | 'overlay', ext: string): string {
  return `kdp-ebook-cover-${variant === 'overlay' ? 'guides-overlay' : 'template'}_${layout.widthPx}x${layout.heightPx}px.${ext}`;
}

export interface EbookRow {
  id: string;
  label: string;
  value: string;
  note?: string;
}

export function ebookRows(layout: EbookLayout): EbookRow[] {
  const { widthPx: w, heightPx: h } = layout;
  const rows: EbookRow[] = [
    { id: 'size', label: 'Image size', value: `${w} x ${h} px`, note: 'Create your design at exactly this size.' },
    { id: 'ratio', label: 'Height / width', value: `${layout.ratio}:1`, note: 'KDP asks for at least 1.6:1.' },
    { id: 'ideal', label: 'KDP ideal', value: `${EBOOK.idealWidth} x ${EBOOK.idealHeight} px (HD: ${EBOOK.hdWidth} x ${EBOOK.hdHeight})` },
    { id: 'limits', label: 'Allowed range', value: `longest side 500 px to ${EBOOK.maxSide.toLocaleString('en-US')} px; minimum ${EBOOK.minWidth} x ${EBOOK.minHeight}` },
    { id: 'file', label: 'File', value: 'JPEG preferred (PNG, TIFF also accepted), RGB, under 50 MB, 300 DPI' },
    { id: 'border', label: 'Light covers', value: `Add a ${EBOOK.borderPx[0]}-${EBOOK.borderPx[1]} px medium-gray border`, note: 'Stops white covers dissolving into the page.' },
    { id: 'content', label: 'Include', value: 'Title and author, matching your detail page' },
    { id: 'exclude', label: 'Leave out', value: 'Spine, barcode, back cover, flaps, prices, promotions, placeholder text' },
  ];
  return rows;
}

export function ebookSummaryText(layout: EbookLayout): string {
  const out = ['KDP KINDLE EBOOK COVER TEMPLATE', '', `Image size: ${layout.widthPx} x ${layout.heightPx} px (${layout.ratio}:1)`, ''];
  for (const r of ebookRows(layout)) out.push(`  ${r.label}: ${r.value}`);
  if (layout.warnings.length) {
    out.push('', 'NOTES');
    for (const w of layout.warnings) out.push(`  [${w.level.toUpperCase()}] ${w.message}`);
  }
  return out.join('\n') + '\n';
}
