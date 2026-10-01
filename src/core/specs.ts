/**
 * KDP paperback specifications.
 *
 * Values come from Amazon's "KDP Print File Setup Calculator V5" (the workbook shipped in
 * this repo's reference folder) and are cross-checked against KDP's public help pages.
 * See docs/KDP-SPECS.md for the source of every number.
 *
 * All lengths are in inches.
 */

// --- Cover constants -------------------------------------------------------------------------

/** Bleed added to the top, bottom and outside edges of the cover. Source: calculator + KDP help. */
export const BLEED = 0.125;

/** Distance from the OUTER (bleed) edge of the cover to the safe zone. = 0.125 bleed + 0.125 trim variance. */
export const COVER_SAFE_MARGIN = 0.25;

/** More cautious alternative: 0.25" inside the trim line (same rule KDP uses for bleed interiors). */
export const COVER_SAFE_MARGIN_CONSERVATIVE = BLEED + 0.25;

/** Trim variance: how far the knife may wander from the trim line. Source: calculator. */
export const TRIM_VARIANCE = 0.125;

/** Minimum gap between spine text and either fold line. Source: calculator + KDP help. */
export const SPINE_MARGIN = 0.0625;

/**
 * Safe gap between front/back artwork and the spine fold.
 * App choice: KDP only publishes a 0.0625" fold variance, so we reuse the 0.125" trim variance
 * to keep important content clear of the fold.
 */
export const FOLD_SAFE_MARGIN = TRIM_VARIANCE;

/** KDP drops an ISBN barcode in this white box (lower corner of the back cover next to the spine). */
export const BARCODE = { width: 2, height: 1.2, margin: 0.25 } as const;

/** KDP does not print spine text on books with fewer pages. Covers with spine text are rejected. */
export const SPINE_TEXT_MIN_PAGES = 79;

/** KDP paperback page-count limits. */
export const MIN_PAGES = 24;
export const ABSOLUTE_MAX_PAGES = 828;

// --- Paper / ink -----------------------------------------------------------------------------

export type PaperId = 'bw-cream' | 'bw-white' | 'color-standard' | 'color-premium';

export interface PaperType {
  id: PaperId;
  label: string;
  /** Thickness of one page (one leaf = two printed pages is NOT used; KDP's formula is pages x this). */
  thickness: number;
  /** Which column of KDP's max-page-count table applies. */
  maxColumn: 'cream' | 'white' | 'color';
  /** Where the thickness number comes from. */
  source: 'calculator' | 'kdp-help';
}

export const PAPER_TYPES: readonly PaperType[] = [
  { id: 'bw-white', label: 'Black ink, white paper', thickness: 0.002252, maxColumn: 'white', source: 'calculator' },
  { id: 'bw-cream', label: 'Black ink, cream paper', thickness: 0.0025, maxColumn: 'cream', source: 'calculator' },
  { id: 'color-premium', label: 'Premium color, white paper', thickness: 0.002347, maxColumn: 'color', source: 'calculator' },
  { id: 'color-standard', label: 'Standard color, white paper', thickness: 0.002252, maxColumn: 'color', source: 'kdp-help' },
];

export function getPaper(id: PaperId): PaperType {
  const paper = PAPER_TYPES.find((p) => p.id === id);
  if (!paper) throw new Error(`Unknown paper type: ${id}`);
  return paper;
}

// --- Trim sizes ------------------------------------------------------------------------------

export interface TrimSize {
  id: string;
  width: number;
  height: number;
  /** Max page count per paper column; `null` = ink/paper combination not available at this size. */
  maxPages: { cream: number | null; white: number | null; color: number | null } | undefined;
  /** Free-form remark shown in the UI. */
  note?: string;
}

const STD = { cream: 776, white: 828, color: 828 };
const MID = { cream: 750, white: 800, color: 800 };
const BIG = { cream: 550, white: 590, color: 590 };

/** Trim sizes from the calculator's lookup table (plus 8.25 x 11, found in Amazon's manuscript templates). */
export const TRIM_SIZES: readonly TrimSize[] = [
  { id: '5x8', width: 5, height: 8, maxPages: STD },
  { id: '5.06x7.81', width: 5.06, height: 7.81, maxPages: STD },
  { id: '5.25x8', width: 5.25, height: 8, maxPages: STD },
  { id: '5.5x8.5', width: 5.5, height: 8.5, maxPages: STD },
  { id: '6x9', width: 6, height: 9, maxPages: STD },
  { id: '6.14x9.21', width: 6.14, height: 9.21, maxPages: STD },
  { id: '6.69x9.61', width: 6.69, height: 9.61, maxPages: STD },
  { id: '7x10', width: 7, height: 10, maxPages: STD },
  { id: '7.44x9.69', width: 7.44, height: 9.69, maxPages: STD },
  { id: '7.5x9.25', width: 7.5, height: 9.25, maxPages: STD },
  { id: '8x10', width: 8, height: 10, maxPages: STD },
  { id: '8.25x6', width: 8.25, height: 6, maxPages: MID },
  { id: '8.25x8.25', width: 8.25, height: 8.25, maxPages: MID },
  { id: '8.5x8.5', width: 8.5, height: 8.5, maxPages: BIG },
  { id: '8.5x11', width: 8.5, height: 11, maxPages: BIG },
  {
    id: '8.27x11.69',
    width: 8.27,
    height: 11.69,
    maxPages: { cream: 730, white: 780, color: null },
    note: 'A4. Color printing is not available at this size.',
  },
  {
    id: '8.25x11',
    width: 8.25,
    height: 11,
    maxPages: undefined,
    note: 'Not in the V5 calculator (it appears in Amazon’s manuscript templates). Page limits unverified.',
  },
];

export const CUSTOM_TRIM_ID = 'custom';

/** Typical custom-size window used for a soft warning only; KDP's calculator does not define one. */
export const CUSTOM_TRIM_RANGE = { minWidth: 4, maxWidth: 8.5, minHeight: 6, maxHeight: 11.69 } as const;

export function getTrimSize(id: string): TrimSize | undefined {
  return TRIM_SIZES.find((t) => t.id === id);
}

/** Largest page count KDP allows for this size + paper, or `null` if the combination is unavailable. */
export function maxPageCount(trim: TrimSize | undefined, paper: PaperType): number | null {
  const table = trim?.maxPages;
  if (!table) {
    // Unknown / custom size: fall back to the global limit (cream is thicker, so its cap is lower).
    return paper.maxColumn === 'cream' ? 776 : ABSOLUTE_MAX_PAGES;
  }
  return table[paper.maxColumn];
}
