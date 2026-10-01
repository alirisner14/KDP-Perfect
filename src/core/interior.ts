/**
 * Interior (manuscript) geometry.
 *
 * Not used by the UI yet. It lives in the core because the upcoming "Word document -> KDP interior"
 * feature (see docs/ROADMAP.md) needs exactly these numbers, and they come from the same KDP
 * calculator as the cover maths. Keeping them here means the interior builder can reuse the same
 * validated specs instead of re-deriving them.
 */

import { BLEED, MIN_PAGES, ABSOLUTE_MAX_PAGES } from './specs';
import { round } from './units';

/** KDP's inside (gutter) margin grows with page count. Upper bounds are inclusive. */
const GUTTER_TABLE: readonly { upTo: number; gutter: number }[] = [
  { upTo: 150, gutter: 0.375 },
  { upTo: 300, gutter: 0.5 },
  { upTo: 500, gutter: 0.625 },
  { upTo: 700, gutter: 0.75 },
  { upTo: ABSOLUTE_MAX_PAGES, gutter: 0.875 },
];

/** Minimum outside margin (also top and bottom): no bleed / with bleed. */
export const OUTSIDE_MARGIN = { noBleed: 0.25, bleed: 0.375 } as const;

export function gutterMargin(pageCount: number): number {
  if (!Number.isInteger(pageCount) || pageCount < MIN_PAGES || pageCount > ABSOLUTE_MAX_PAGES) {
    throw new RangeError(`Page count must be a whole number from ${MIN_PAGES} to ${ABSOLUTE_MAX_PAGES}.`);
  }
  const row = GUTTER_TABLE.find((r) => pageCount <= r.upTo);
  // The range check above guarantees a match.
  return row ? row.gutter : GUTTER_TABLE[GUTTER_TABLE.length - 1]!.gutter;
}

export interface InteriorLayout {
  /** Page size to set in Word / the PDF (trim, or trim + bleed). */
  pageWidth: number;
  pageHeight: number;
  /** Mirrored margins: `inside` is the gutter side. */
  margins: { inside: number; outside: number; top: number; bottom: number };
  /** Area available for text and images that must not be trimmed. */
  safeWidth: number;
  safeHeight: number;
  bleed: boolean;
}

export function interiorLayout(trimWidth: number, trimHeight: number, pageCount: number, bleed: boolean): InteriorLayout {
  const inside = gutterMargin(pageCount);
  const outside = bleed ? OUTSIDE_MARGIN.bleed : OUTSIDE_MARGIN.noBleed;
  // With bleed, KDP adds 0.125" to the width and 0.25" to the height of the page.
  const pageWidth = round(trimWidth + (bleed ? BLEED : 0));
  const pageHeight = round(trimHeight + (bleed ? 2 * BLEED : 0));
  return {
    pageWidth,
    pageHeight,
    margins: { inside, outside, top: outside, bottom: outside },
    safeWidth: round(pageWidth - inside - outside),
    safeHeight: round(pageHeight - 2 * outside),
    bleed,
  };
}
