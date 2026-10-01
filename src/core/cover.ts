/**
 * Cover geometry: turns a book's measurements into every box, guide and warning needed to
 * build a full-wrap paperback cover template.
 *
 * Coordinate system: inches, origin at the TOP-LEFT of the full canvas (bleed edge), y grows down.
 * Everything here is pure maths: no DOM, no I/O. That keeps it unit-testable and lets the same
 * code run in Electron, in a browser build, or in Node.
 */

import {
  BARCODE,
  BLEED,
  COVER_SAFE_MARGIN,
  CUSTOM_TRIM_RANGE,
  FOLD_SAFE_MARGIN,
  MIN_PAGES,
  SPINE_MARGIN,
  SPINE_TEXT_MIN_PAGES,
  getPaper,
  getTrimSize,
  maxPageCount,
  type PaperId,
} from './specs';
import { round } from './units';

export type ReadingDirection = 'ltr' | 'rtl';

export interface CoverInput {
  /** Trim width/height of ONE page, inches. */
  trimWidth: number;
  trimHeight: number;
  pageCount: number;
  paper: PaperId;
  /** `ltr`: back cover on the left, front on the right. `rtl` (e.g. Japanese): mirrored. */
  readingDirection: ReadingDirection;
  /**
   * Distance from the outer canvas edge to the safe zone. Defaults to KDP's 0.25".
   * Pass `COVER_SAFE_MARGIN_CONSERVATIVE` for 0.25" inside the trim line.
   */
  safeMargin?: number;
  /** Id of the chosen preset trim size, if any. Used for page-limit validation. */
  trimId?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WarningLevel = 'error' | 'warning' | 'info';

export interface LayoutWarning {
  level: WarningLevel;
  code: string;
  message: string;
}

export interface Guide {
  /** Machine id, stable for tests. */
  id: string;
  label: string;
  /** Distance from the left (vertical guide) or top (horizontal guide) of the canvas, inches. */
  at: number;
}

export interface CoverLayout {
  input: CoverInput;
  bleed: number;
  safeMargin: number;
  spineWidth: number;
  canvas: { w: number; h: number };
  /** Everything inside the bleed: the finished (trimmed) cover. */
  trim: Rect;
  back: Rect;
  spine: Rect;
  front: Rect;
  safe: {
    /** One box over the whole cover (KDP calculator's "Safe Zone"). */
    overall: Rect;
    back: Rect;
    front: Rect;
    /** `null` when KDP does not allow spine text (under 79 pages) or the spine is too thin. */
    spineText: Rect | null;
  };
  /** Width of the spine text zone, even when negative (very thin spines); matches the calculator. */
  spineTextWidth: number;
  spineTextAllowed: boolean;
  barcode: Rect;
  guides: { vertical: Guide[]; horizontal: Guide[] };
  warnings: LayoutWarning[];
  valid: boolean;
}

export function computeCoverLayout(input: CoverInput): CoverLayout {
  const paper = getPaper(input.paper);
  const safeMargin = input.safeMargin ?? COVER_SAFE_MARGIN;
  const { trimWidth: tw, trimHeight: th, pageCount } = input;

  const spineWidth = round(pageCount * paper.thickness);
  const canvasW = round(BLEED + tw + spineWidth + tw + BLEED);
  const canvasH = round(BLEED + th + BLEED);

  const trim: Rect = { x: BLEED, y: BLEED, w: round(2 * tw + spineWidth), h: th };

  // Left-to-right books: back | spine | front. Right-to-left books are mirrored.
  const ltr = input.readingDirection === 'ltr';
  const leftPanel: Rect = { x: BLEED, y: BLEED, w: tw, h: th };
  const spine: Rect = { x: round(BLEED + tw), y: BLEED, w: spineWidth, h: th };
  const rightPanel: Rect = { x: round(BLEED + tw + spineWidth), y: BLEED, w: tw, h: th };
  const back = ltr ? leftPanel : rightPanel;
  const front = ltr ? rightPanel : leftPanel;

  // --- Safe areas -------------------------------------------------------------------------
  const overall: Rect = rect(safeMargin, safeMargin, canvasW - 2 * safeMargin, canvasH - 2 * safeMargin);
  const safeTop = safeMargin;
  const safeH = canvasH - 2 * safeMargin;

  // Outer edge of a panel sits at the overall safe margin; the edge facing the spine stays clear of the fold.
  const leftSafe = rect(safeMargin, safeTop, leftPanel.x + leftPanel.w - FOLD_SAFE_MARGIN - safeMargin, safeH);
  const rightSafe = rect(
    spine.x + spine.w + FOLD_SAFE_MARGIN,
    safeTop,
    canvasW - safeMargin - (spine.x + spine.w + FOLD_SAFE_MARGIN),
    safeH,
  );

  const spineTextWidth = round(spineWidth - 2 * SPINE_MARGIN);
  const spineTextAllowed = pageCount >= SPINE_TEXT_MIN_PAGES && spineTextWidth > 0;
  const spineText: Rect | null = spineTextAllowed ? rect(spine.x + SPINE_MARGIN, safeTop, spineTextWidth, safeH) : null;

  // --- Barcode ----------------------------------------------------------------------------
  // Lower corner of the back cover, on the side that touches the spine.
  const barcodeY = round(trim.y + th - BARCODE.margin - BARCODE.height);
  const barcodeX = ltr
    ? round(spine.x - BARCODE.margin - BARCODE.width)
    : round(spine.x + spine.w + BARCODE.margin);
  const barcode: Rect = { x: barcodeX, y: barcodeY, w: BARCODE.width, h: BARCODE.height };

  // --- Guides (for placing rulers/shapes in a design tool) ---------------------------------
  const vertical: Guide[] = [
    { id: 'bleed-left', label: 'Left bleed edge (canvas edge)', at: 0 },
    { id: 'safe-left', label: 'Left safe edge', at: safeMargin },
    { id: 'trim-left', label: 'Left trim line', at: BLEED },
    {
      id: ltr ? 'back-safe-inner' : 'front-safe-inner',
      label: `${ltr ? 'Back' : 'Front'} cover safe edge (spine side)`,
      at: round(spine.x - FOLD_SAFE_MARGIN),
    },
    { id: 'fold-left', label: 'Spine fold (left)', at: spine.x },
    { id: 'spine-text-left', label: 'Spine text zone (left)', at: round(spine.x + SPINE_MARGIN) },
    { id: 'spine-text-right', label: 'Spine text zone (right)', at: round(spine.x + spine.w - SPINE_MARGIN) },
    { id: 'fold-right', label: 'Spine fold (right)', at: round(spine.x + spine.w) },
    {
      id: ltr ? 'front-safe-inner' : 'back-safe-inner',
      label: `${ltr ? 'Front' : 'Back'} cover safe edge (spine side)`,
      at: round(spine.x + spine.w + FOLD_SAFE_MARGIN),
    },
    { id: 'trim-right', label: 'Right trim line', at: round(canvasW - BLEED) },
    { id: 'safe-right', label: 'Right safe edge', at: round(canvasW - safeMargin) },
    { id: 'bleed-right', label: 'Right bleed edge (canvas edge)', at: canvasW },
  ];
  const horizontal: Guide[] = [
    { id: 'bleed-top', label: 'Top bleed edge (canvas edge)', at: 0 },
    { id: 'safe-top', label: 'Top safe edge', at: safeMargin },
    { id: 'trim-top', label: 'Top trim line', at: BLEED },
    { id: 'trim-bottom', label: 'Bottom trim line', at: round(canvasH - BLEED) },
    { id: 'safe-bottom', label: 'Bottom safe edge', at: round(canvasH - safeMargin) },
    { id: 'bleed-bottom', label: 'Bottom bleed edge (canvas edge)', at: canvasH },
  ];

  const warnings = validate(input, { spineWidth, spineTextWidth, spineTextAllowed, backWidth: back.w });
  const valid = !warnings.some((w) => w.level === 'error');

  return {
    input,
    bleed: BLEED,
    safeMargin,
    spineWidth,
    canvas: { w: canvasW, h: canvasH },
    trim,
    back,
    spine,
    front,
    safe: { overall, back: ltr ? leftSafe : rightSafe, front: ltr ? rightSafe : leftSafe, spineText },
    spineTextWidth,
    spineTextAllowed,
    barcode,
    guides: { vertical: byPosition(vertical), horizontal: byPosition(horizontal) },
    warnings,
    valid,
  };
}

/** Stable sort so guides read in the order a designer meets them on the canvas. */
function byPosition(guides: Guide[]): Guide[] {
  return guides
    .map((g, i) => ({ g, i }))
    .sort((a, b) => a.g.at - b.g.at || a.i - b.i)
    .map(({ g }) => g);
}

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function validate(
  input: CoverInput,
  m: { spineWidth: number; spineTextWidth: number; spineTextAllowed: boolean; backWidth: number },
): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  const { pageCount, trimWidth, trimHeight } = input;
  const paper = getPaper(input.paper);
  const trim = input.trimId ? getTrimSize(input.trimId) : undefined;

  if (!Number.isFinite(trimWidth) || !Number.isFinite(trimHeight) || trimWidth <= 0 || trimHeight <= 0) {
    out.push({ level: 'error', code: 'trim-invalid', message: 'Enter a trim width and height greater than zero.' });
  } else if (!trim) {
    const r = CUSTOM_TRIM_RANGE;
    if (trimWidth < r.minWidth || trimWidth > r.maxWidth || trimHeight < r.minHeight || trimHeight > r.maxHeight) {
      out.push({
        level: 'warning',
        code: 'trim-custom-range',
        message: `Custom trim sizes are usually ${r.minWidth}"-${r.maxWidth}" wide and ${r.minHeight}"-${r.maxHeight}" tall on KDP. Check KDP before ordering.`,
      });
    }
  }

  if (!Number.isInteger(pageCount)) {
    out.push({ level: 'error', code: 'pages-invalid', message: 'Page count must be a whole number.' });
    return out;
  }
  if (pageCount < MIN_PAGES) {
    out.push({ level: 'error', code: 'pages-min', message: `KDP paperbacks need at least ${MIN_PAGES} pages.` });
  }
  const max = maxPageCount(trim, paper);
  if (max === null) {
    out.push({
      level: 'error',
      code: 'paper-unavailable',
      message: `${paper.label} is not available at this trim size. Pick a different ink and paper option.`,
    });
  } else if (pageCount > max) {
    out.push({
      level: 'error',
      code: 'pages-max',
      message: `KDP allows at most ${max} pages for this trim size and paper (you entered ${pageCount}).`,
    });
  } else if (!trim) {
    out.push({
      level: 'info',
      code: 'pages-max-unknown',
      message: 'Page-count limits for custom sizes are not published in KDP’s calculator; check the limit on KDP.',
    });
  } else if (trim.maxPages === undefined) {
    out.push({
      level: 'info',
      code: 'pages-max-unknown',
      message: 'KDP’s calculator does not list page limits for this trim size; check the limit on KDP.',
    });
  }

  if (pageCount < SPINE_TEXT_MIN_PAGES) {
    out.push({
      level: 'warning',
      code: 'spine-text-min-pages',
      message: `KDP rejects spine text on books under ${SPINE_TEXT_MIN_PAGES} pages, so no spine text zone is shown. Keep the spine free of text.`,
    });
  } else if (!m.spineTextAllowed) {
    out.push({
      level: 'warning',
      code: 'spine-too-thin',
      message: 'The spine is too thin to hold text after the 0.0625" side margins.',
    });
  }

  if (m.backWidth < BARCODE.width + 2 * BARCODE.margin) {
    out.push({
      level: 'warning',
      code: 'barcode-fit',
      message: 'The back cover is narrower than KDP’s 2" barcode box plus margins.',
    });
  }

  return out;
}
