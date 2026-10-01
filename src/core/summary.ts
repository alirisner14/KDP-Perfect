/**
 * Human-readable measurements derived from a {@link CoverLayout}: the table shown in the UI,
 * the text copied to the clipboard, and export file names.
 */

import type { CoverLayout } from './cover';
import { BARCODE, SPINE_MARGIN, getPaper } from './specs';
import { formatLength, formatSize, toPixels, type Unit } from './units';

export interface MeasurementRow {
  id: string;
  label: string;
  /** Primary value in inches (width), and an optional height. */
  w: number;
  h?: number;
  note?: string;
}

export function measurementRows(layout: CoverLayout): MeasurementRow[] {
  const { canvas, safe, input } = layout;
  const ltr = input.readingDirection === 'ltr';
  const rows: MeasurementRow[] = [
    { id: 'canvas', label: 'Full cover canvas (with bleed)', w: canvas.w, h: canvas.h, note: 'Use this as your custom design size.' },
    { id: 'bleed', label: 'Bleed (every outer edge)', w: layout.bleed, note: 'Extend backgrounds and images this far past the trim line.' },
    {
      id: 'trim',
      label: `${ltr ? 'Back' : 'Front'} cover | ${ltr ? 'Front' : 'Back'} cover (each, trimmed)`,
      w: input.trimWidth,
      h: input.trimHeight,
    },
    { id: 'spine', label: 'Spine width', w: layout.spineWidth, note: `${input.pageCount} pages x ${getPaper(input.paper).thickness}" per page.` },
  ];
  if (layout.spineTextAllowed && safe.spineText) {
    rows.push({
      id: 'spine-text',
      label: 'Spine text zone',
      w: safe.spineText.w,
      h: safe.spineText.h,
      note: `${formatLength(SPINE_MARGIN, 'in')} clear of each fold.`,
    });
  } else {
    rows.push({ id: 'spine-text', label: 'Spine text zone', w: Math.max(0, layout.spineTextWidth), note: 'Not available: keep the spine free of text.' });
  }
  rows.push(
    { id: 'safe-overall', label: 'Safe zone (whole cover)', w: safe.overall.w, h: safe.overall.h, note: `${formatLength(layout.safeMargin, 'in')} in from the canvas edge.` },
    { id: 'safe-back', label: 'Back cover safe area', w: safe.back.w, h: safe.back.h },
    { id: 'safe-front', label: 'Front cover safe area', w: safe.front.w, h: safe.front.h },
    { id: 'barcode', label: 'Barcode area (back cover)', w: BARCODE.width, h: BARCODE.height, note: `${formatLength(BARCODE.margin, 'in')} from the spine and the bottom trim line. Keep clear.` },
  );
  return rows;
}

export function formatRow(row: MeasurementRow, unit: Unit): string {
  return row.h === undefined ? formatLength(row.w, unit) : formatSize(row.w, row.h, unit);
}

export function paperLabel(layout: CoverLayout): string {
  return getPaper(layout.input.paper).label;
}

/** Plain-text summary for the clipboard or a .txt export. */
export function summaryText(layout: CoverLayout, unit: Unit, dpi: number): string {
  const { canvas, input } = layout;
  const L = (v: number) => formatLength(v, unit);
  const out: string[] = [];
  out.push('KDP COVER TEMPLATE');
  out.push(`Trim size: ${formatSize(input.trimWidth, input.trimHeight, unit)}`);
  out.push(`Pages: ${input.pageCount} (${paperLabel(layout)})`);
  out.push(`Reading direction: ${input.readingDirection === 'ltr' ? 'left to right' : 'right to left'}`);
  out.push('');
  out.push('CANVAS SIZE (create your design at this size)');
  out.push(`  ${formatSize(canvas.w, canvas.h, 'in')}`);
  out.push(`  ${formatSize(canvas.w, canvas.h, 'cm')}`);
  out.push(`  ${formatSize(canvas.w, canvas.h, 'mm')}`);
  out.push(`  ${toPixels(canvas.w, dpi)} x ${toPixels(canvas.h, dpi)} px at ${dpi} DPI`);
  out.push('');
  out.push('MEASUREMENTS');
  for (const r of measurementRows(layout)) out.push(`  ${r.label}: ${formatRow(r, unit)}`);
  out.push('');
  out.push(`GUIDE POSITIONS, measured from the left edge of the canvas (${unit})`);
  for (const g of layout.guides.vertical) out.push(`  ${L(g.at).padEnd(14)} ${g.label}`);
  out.push('');
  out.push(`GUIDE POSITIONS, measured from the top edge of the canvas (${unit})`);
  for (const g of layout.guides.horizontal) out.push(`  ${L(g.at).padEnd(14)} ${g.label}`);
  if (layout.warnings.length) {
    out.push('');
    out.push('NOTES');
    for (const w of layout.warnings) out.push(`  [${w.level.toUpperCase()}] ${w.message}`);
  }
  return out.join('\n') + '\n';
}

export type ExportVariant = 'template' | 'overlay';
export type ExportFormat = 'png' | 'jpg' | 'pdf';

/** e.g. `kdp-cover-template_6x9in_333pp_white.png` */
export function exportFileName(layout: CoverLayout, variant: ExportVariant, ext: string): string {
  const { input } = layout;
  const trim = `${Number(input.trimWidth.toFixed(3))}x${Number(input.trimHeight.toFixed(3))}in`;
  const paper = input.paper.replace(/^bw-/, '');
  const kind = variant === 'overlay' ? 'kdp-cover-guides-overlay' : 'kdp-cover-template';
  return `${kind}_${trim}_${input.pageCount}pp_${paper}.${ext}`;
}
