/**
 * KDP print specifications (paperback and hardcover).
 *
 * Sources, in order of authority:
 *  1. KDP's live Print Cover Calculator (kdp.amazon.com/cover-calculator), run on 2026-10-29.
 *  2. Amazon's "KDP Print File Setup Calculator V5" workbook (the reference folder next to this repo).
 *  3. KDP help pages.
 * docs/KDP-SPECS.md lists the source of every number and every place the sources disagree.
 *
 * All lengths are in inches.
 */

export type Binding = 'paperback' | 'hardcover';

const mm = (v: number) => v / 25.4;

// --- Paperback cover constants ---------------------------------------------------------------

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

/** KDP does not print spine text on paperbacks with fewer pages. Covers with spine text are rejected. */
export const SPINE_TEXT_MIN_PAGES = 79;

/** KDP paperback page-count limits (min from the calculator and help; max from the help table). */
export const MIN_PAGES = 24;
export const ABSOLUTE_MAX_PAGES = 828;

// --- Hardcover (case laminate) cover constants -----------------------------------------------
// Every value below was read from KDP's live calculator; its figures are the metric sizes
// converted to inches (e.g. wrap 15 mm = 0.591"), so the constants are kept in millimetres.

export const HARDCOVER = {
  /** Artwork past the board edge on all four sides; it wraps around the case board. */
  wrap: mm(15),
  /** The front/back board is the trim size plus this much (width) and this much (height). */
  boardExtraWidth: mm(5),
  boardExtraHeight: mm(6),
  /** Band next to the spine where the board flexes: keep text and barcodes out. */
  hinge: mm(10),
  /** Safe margin inside the board edge. */
  margin: 0.125,
  /** The case adds this to pages x thickness when sizing the spine. */
  spineAddon: mm(4.8),
  /** Own-barcode / KDP barcode placement: from the bottom board edge, and from the hinge. */
  barcodeBottom: 0.375,
  barcodeSide: 0.25,
  minPages: 76,
  maxPages: 550,
} as const;

// --- Paper / ink -----------------------------------------------------------------------------

export type PaperId = 'bw-cream' | 'bw-white' | 'bw-groundwood' | 'color-standard' | 'color-premium';

export interface PaperType {
  id: PaperId;
  label: string;
  /** Thickness of one page (KDP's formula is pages x this). */
  thickness: number;
  /** Which column of KDP's max-page-count table applies. */
  maxColumn: 'cream' | 'white' | 'color';
  /** Bindings that offer this paper. */
  bindings: readonly Binding[];
}

export const PAPER_TYPES: readonly PaperType[] = [
  { id: 'bw-white', label: 'Black ink, white paper', thickness: 0.002252, maxColumn: 'white', bindings: ['paperback', 'hardcover'] },
  { id: 'bw-cream', label: 'Black ink, cream paper', thickness: 0.0025, maxColumn: 'cream', bindings: ['paperback', 'hardcover'] },
  { id: 'bw-groundwood', label: 'Black ink, groundwood paper', thickness: 0.00235, maxColumn: 'white', bindings: ['paperback'] },
  { id: 'color-premium', label: 'Premium color, white paper', thickness: 0.002347, maxColumn: 'color', bindings: ['paperback', 'hardcover'] },
  { id: 'color-standard', label: 'Standard color, white paper', thickness: 0.002252, maxColumn: 'color', bindings: ['paperback'] },
];

export function getPaper(id: PaperId): PaperType {
  const paper = PAPER_TYPES.find((p) => p.id === id);
  if (!paper) throw new Error(`Unknown paper type: ${id}`);
  return paper;
}

export function papersFor(binding: Binding): PaperType[] {
  return PAPER_TYPES.filter((p) => p.bindings.includes(binding));
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

/** Paperback trim sizes: the calculator's lookup table, confirmed against the live calculator's list. */
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
];

/** Hardcover (case laminate) trim sizes offered by KDP's calculator. All share the 76-550 page range. */
export const HARDCOVER_TRIM_SIZES: readonly TrimSize[] = [
  { id: '5.5x8.5', width: 5.5, height: 8.5, maxPages: undefined },
  { id: '6x9', width: 6, height: 9, maxPages: undefined },
  { id: '6.14x9.21', width: 6.14, height: 9.21, maxPages: undefined },
  { id: '7x10', width: 7, height: 10, maxPages: undefined },
  { id: '8.25x11', width: 8.25, height: 11, maxPages: undefined },
];

export const CUSTOM_TRIM_ID = 'custom';

/** KDP's calculator rejects custom paperback sizes outside this window (hardcover has no custom size). */
export const CUSTOM_TRIM_RANGE = { minWidth: 4, maxWidth: 8.5, minHeight: 6, maxHeight: 11.69 } as const;

export function trimSizesFor(binding: Binding): readonly TrimSize[] {
  return binding === 'hardcover' ? HARDCOVER_TRIM_SIZES : TRIM_SIZES;
}

export function getTrimSize(id: string, binding: Binding = 'paperback'): TrimSize | undefined {
  return trimSizesFor(binding).find((t) => t.id === id);
}

/** Largest paperback page count KDP allows for this size + paper, or `null` if the combination is unavailable. */
export function maxPageCount(trim: TrimSize | undefined, paper: PaperType): number | null {
  const table = trim?.maxPages;
  if (!table) {
    // Unknown / custom size: fall back to the global limit (cream is thicker, so its cap is lower).
    return paper.maxColumn === 'cream' ? 776 : ABSOLUTE_MAX_PAGES;
  }
  return table[paper.maxColumn];
}

/** Page-count window for a binding, trim size and paper. `max` is `null` when the combination is unavailable. */
export function pageLimits(binding: Binding, trim: TrimSize | undefined, paper: PaperType): { min: number; max: number | null } {
  if (binding === 'hardcover') return { min: HARDCOVER.minPages, max: HARDCOVER.maxPages };
  return { min: MIN_PAGES, max: maxPageCount(trim, paper) };
}
