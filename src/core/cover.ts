/**
 * Cover geometry: turns a book's measurements into every box, guide and warning needed to
 * build a full-wrap cover template, for paperbacks and for hardcovers (case laminate).
 *
 * Coordinate system: inches, origin at the TOP-LEFT of the full canvas, y grows down.
 * Everything here is pure maths: no DOM, no I/O. That keeps it unit-testable and lets the same
 * code run in Electron, in a browser build, or in Node.
 *
 * Vocabulary shared by both bindings:
 *  - `ring`: the outer band of the canvas. Paperback: bleed (trimmed off). Hardcover: wrap (folds
 *    around the case board). Artwork must run all the way to the canvas edge.
 *  - `trim`: the finished outer edge of the cover (paperback trim line, hardcover board edge).
 *  - `back` / `spine` / `front`: the three panels inside `trim`. For a hardcover, back and front
 *    are the boards (trim size + 5 mm x 6 mm).
 */

import {
  BARCODE,
  BLEED,
  COVER_SAFE_MARGIN,
  CUSTOM_TRIM_RANGE,
  FOLD_SAFE_MARGIN,
  HARDCOVER,
  SPINE_MARGIN,
  SPINE_TEXT_MIN_PAGES,
  getPaper,
  getTrimSize,
  pageLimits,
  type Binding,
  type PaperId,
} from './specs';
import { round } from './units';

export type ReadingDirection = 'ltr' | 'rtl';

export interface CoverInput {
  /** `paperback` (default) or `hardcover` (case laminate). */
  binding?: Binding;
  /** Trim width/height of ONE page, inches. */
  trimWidth: number;
  trimHeight: number;
  pageCount: number;
  paper: PaperId;
  /** `ltr`: back cover on the left, front on the right. `rtl` (e.g. Japanese): mirrored. */
  readingDirection: ReadingDirection;
  /**
   * Paperback only: distance from the outer canvas edge to the safe zone. Defaults to KDP's 0.25".
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
  binding: Binding;
  /** Width of the outer ring (bleed for paperbacks, wrap for hardcovers). */
  bleed: number;
  /** `Bleed` or `Wrap`, for labels. */
  ringName: 'Bleed' | 'Wrap';
  /** Distance from the outer canvas edge to the overall safe zone. */
  safeMargin: number;
  spineWidth: number;
  canvas: { w: number; h: number };
  /** Everything inside the ring: the finished cover. */
  trim: Rect;
  back: Rect;
  spine: Rect;
  front: Rect;
  /** Size of one front/back panel (the trim size, or the board for a hardcover). */
  panel: { w: number; h: number };
  safe: {
    /** One box over the whole finished cover. */
    overall: Rect;
    back: Rect;
    front: Rect;
    /** `null` when spine text is not allowed or the spine is too thin. */
    spineText: Rect | null;
  };
  /**
   * Front/back panels inset on the outer sides only (everything except the spine side). The band between a panel
   * and this rect is the trim-variance (paperback) or margin (hardcover) zone.
   */
  marginRects: { back: Rect; front: Rect };
  /** Hardcover only: the strips beside the spine where text and barcodes must stay out. */
  hingeBands: Rect[];
  /** Hinge width (0 for paperbacks). */
  hinge: number;
  /** Width of the spine text zone, even when negative (very thin spines); matches the calculator. */
  spineTextWidth: number;
  spineTextAllowed: boolean;
  barcode: Rect;
  guides: { vertical: Guide[]; horizontal: Guide[] };
  warnings: LayoutWarning[];
  valid: boolean;
}

export function computeCoverLayout(input: CoverInput): CoverLayout {
  return (input.binding ?? 'paperback') === 'hardcover' ? hardcoverLayout(input) : paperbackLayout(input);
}

// --- Paperback -------------------------------------------------------------------------------

function paperbackLayout(input: CoverInput): CoverLayout {
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
  const barcodeX = ltr ? round(spine.x - BARCODE.margin - BARCODE.width) : round(spine.x + spine.w + BARCODE.margin);
  const barcode: Rect = { x: barcodeX, y: barcodeY, w: BARCODE.width, h: BARCODE.height };

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

  const safeBack = ltr ? leftSafe : rightSafe;
  const safeFront = ltr ? rightSafe : leftSafe;
  const warnings = validate(input, 'paperback', { spineTextAllowed, barcodeRoom: back.w - 2 * BARCODE.margin });

  return {
    input,
    binding: 'paperback',
    bleed: BLEED,
    ringName: 'Bleed',
    safeMargin,
    spineWidth,
    canvas: { w: canvasW, h: canvasH },
    trim,
    back,
    spine,
    front,
    panel: { w: tw, h: th },
    safe: { overall, back: safeBack, front: safeFront, spineText },
    marginRects: { back: safeBack, front: safeFront },
    hingeBands: [],
    hinge: 0,
    spineTextWidth,
    spineTextAllowed,
    barcode,
    guides: { vertical: byPosition(vertical), horizontal: byPosition(horizontal) },
    warnings,
    valid: !warnings.some((w) => w.level === 'error'),
  };
}

// --- Hardcover (case laminate) ---------------------------------------------------------------

function hardcoverLayout(input: CoverInput): CoverLayout {
  const paper = getPaper(input.paper);
  const H = HARDCOVER;
  const { trimWidth: tw, trimHeight: th, pageCount } = input;

  const boardW = round(tw + H.boardExtraWidth);
  const boardH = round(th + H.boardExtraHeight);
  const spineWidth = round(pageCount * paper.thickness + H.spineAddon);
  const wrap = round(H.wrap);
  const canvasW = round(2 * wrap + 2 * boardW + spineWidth);
  const canvasH = round(2 * wrap + boardH);

  const ltr = input.readingDirection === 'ltr';
  const trim: Rect = { x: wrap, y: wrap, w: round(2 * boardW + spineWidth), h: boardH };
  const leftPanel: Rect = { x: wrap, y: wrap, w: boardW, h: boardH };
  const spine: Rect = { x: round(wrap + boardW), y: wrap, w: spineWidth, h: boardH };
  const rightPanel: Rect = { x: round(wrap + boardW + spineWidth), y: wrap, w: boardW, h: boardH };
  const back = ltr ? leftPanel : rightPanel;
  const front = ltr ? rightPanel : leftPanel;

  const m = H.margin;
  const hinge = round(H.hinge);
  const top = wrap + m;
  const safeH = boardH - 2 * m;

  // Margin on the three outer sides; the spine side is held back by the hinge instead.
  const leftMargin = rect(leftPanel.x + m, top, boardW - m, safeH);
  const rightMargin = rect(rightPanel.x, top, boardW - m, safeH);
  const leftSafe = rect(leftPanel.x + m, top, boardW - m - hinge, safeH);
  const rightSafe = rect(rightPanel.x + hinge, top, boardW - m - hinge, safeH);
  const hingeBands: Rect[] = [
    rect(spine.x - hinge, top, hinge, safeH),
    rect(spine.x + spine.w, top, hinge, safeH),
  ];

  const spineTextWidth = round(spineWidth - 2 * SPINE_MARGIN);
  const spineTextAllowed = spineTextWidth > 0;
  const spineText: Rect | null = spineTextAllowed ? rect(spine.x + SPINE_MARGIN, top, spineTextWidth, safeH) : null;
  const overall = rect(trim.x + m, top, trim.w - 2 * m, safeH);

  const barcodeY = round(trim.y + boardH - H.barcodeBottom - BARCODE.height);
  const barcodeX = ltr ? round(spine.x - hinge - H.barcodeSide - BARCODE.width) : round(spine.x + spine.w + hinge + H.barcodeSide);
  const barcode: Rect = { x: barcodeX, y: barcodeY, w: BARCODE.width, h: BARCODE.height };

  const vertical: Guide[] = [
    { id: 'wrap-left', label: 'Left wrap edge (canvas edge)', at: 0 },
    { id: 'board-left', label: 'Left board edge (wrap folds here)', at: wrap },
    { id: 'safe-left', label: 'Left safe edge', at: round(wrap + m) },
    {
      id: ltr ? 'back-safe-inner' : 'front-safe-inner',
      label: `${ltr ? 'Back' : 'Front'} cover safe edge (hinge)`,
      at: round(spine.x - hinge),
    },
    { id: 'fold-left', label: 'Spine edge (left)', at: spine.x },
    { id: 'spine-text-left', label: 'Spine text zone (left)', at: round(spine.x + SPINE_MARGIN) },
    { id: 'spine-text-right', label: 'Spine text zone (right)', at: round(spine.x + spine.w - SPINE_MARGIN) },
    { id: 'fold-right', label: 'Spine edge (right)', at: round(spine.x + spine.w) },
    {
      id: ltr ? 'front-safe-inner' : 'back-safe-inner',
      label: `${ltr ? 'Front' : 'Back'} cover safe edge (hinge)`,
      at: round(spine.x + spine.w + hinge),
    },
    { id: 'safe-right', label: 'Right safe edge', at: round(canvasW - wrap - m) },
    { id: 'board-right', label: 'Right board edge (wrap folds here)', at: round(canvasW - wrap) },
    { id: 'wrap-right', label: 'Right wrap edge (canvas edge)', at: canvasW },
  ];
  const horizontal: Guide[] = [
    { id: 'wrap-top', label: 'Top wrap edge (canvas edge)', at: 0 },
    { id: 'board-top', label: 'Top board edge (wrap folds here)', at: wrap },
    { id: 'safe-top', label: 'Top safe edge', at: round(wrap + m) },
    { id: 'safe-bottom', label: 'Bottom safe edge', at: round(canvasH - wrap - m) },
    { id: 'board-bottom', label: 'Bottom board edge (wrap folds here)', at: round(canvasH - wrap) },
    { id: 'wrap-bottom', label: 'Bottom wrap edge (canvas edge)', at: canvasH },
  ];

  const warnings = validate(input, 'hardcover', { spineTextAllowed, barcodeRoom: boardW - m - hinge - H.barcodeSide });

  return {
    input,
    binding: 'hardcover',
    bleed: wrap,
    ringName: 'Wrap',
    safeMargin: round(wrap + m),
    spineWidth,
    canvas: { w: canvasW, h: canvasH },
    trim,
    back,
    spine,
    front,
    panel: { w: boardW, h: boardH },
    safe: { overall, back: ltr ? leftSafe : rightSafe, front: ltr ? rightSafe : leftSafe, spineText },
    marginRects: { back: ltr ? leftMargin : rightMargin, front: ltr ? rightMargin : leftMargin },
    hingeBands,
    hinge,
    spineTextWidth,
    spineTextAllowed,
    barcode,
    guides: { vertical: byPosition(vertical), horizontal: byPosition(horizontal) },
    warnings,
    valid: !warnings.some((w) => w.level === 'error'),
  };
}

// --- Shared helpers --------------------------------------------------------------------------

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
  binding: Binding,
  m: { spineTextAllowed: boolean; barcodeRoom: number },
): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  const { pageCount, trimWidth, trimHeight } = input;
  const paper = getPaper(input.paper);
  const trim = input.trimId ? getTrimSize(input.trimId, binding) : undefined;

  if (!paper.bindings.includes(binding)) {
    out.push({
      level: 'error',
      code: 'paper-unavailable',
      message: `${paper.label} is not available for ${binding === 'hardcover' ? 'hardcovers' : 'paperbacks'}. Pick a different ink and paper option.`,
    });
  }

  if (!Number.isFinite(trimWidth) || !Number.isFinite(trimHeight) || trimWidth <= 0 || trimHeight <= 0) {
    out.push({ level: 'error', code: 'trim-invalid', message: 'Enter a trim width and height greater than zero.' });
  } else if (!trim) {
    if (binding === 'hardcover') {
      out.push({
        level: 'error',
        code: 'trim-not-hardcover',
        message: 'KDP hardcovers come in 5.5 x 8.5, 6 x 9, 6.14 x 9.21, 7 x 10 and 8.25 x 11 inches. Custom sizes are not offered.',
      });
    } else {
      const r = CUSTOM_TRIM_RANGE;
      if (trimWidth < r.minWidth || trimWidth > r.maxWidth || trimHeight < r.minHeight || trimHeight > r.maxHeight) {
        out.push({
          level: 'error',
          code: 'trim-custom-range',
          message: `KDP custom trim sizes must be ${r.minWidth}"-${r.maxWidth}" wide and ${r.minHeight}"-${r.maxHeight}" tall.`,
        });
      }
    }
  }

  if (!Number.isInteger(pageCount)) {
    out.push({ level: 'error', code: 'pages-invalid', message: 'Page count must be a whole number.' });
    return out;
  }

  const limits = pageLimits(binding, trim, paper);
  if (pageCount < limits.min) {
    out.push({ level: 'error', code: 'pages-min', message: `KDP ${binding === 'hardcover' ? 'hardcovers' : 'paperbacks'} need at least ${limits.min} pages.` });
  }
  if (limits.max === null) {
    out.push({
      level: 'error',
      code: 'paper-unavailable',
      message: `${paper.label} is not available at this trim size. Pick a different ink and paper option.`,
    });
  } else if (pageCount > limits.max) {
    out.push({
      level: 'error',
      code: 'pages-max',
      message: `KDP allows at most ${limits.max} pages for this ${binding === 'hardcover' ? 'binding' : 'trim size and paper'} (you entered ${pageCount}).`,
    });
  } else if (binding === 'paperback' && !trim) {
    out.push({
      level: 'info',
      code: 'pages-max-unknown',
      message: 'Page-count limits for custom sizes are not published in KDP’s calculator; check the limit on KDP.',
    });
  }

  if (binding === 'paperback') {
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
  } else if (!m.spineTextAllowed) {
    out.push({ level: 'warning', code: 'spine-too-thin', message: 'The spine is too thin to hold text after the 0.0625" side margins.' });
  }

  if (m.barcodeRoom < BARCODE.width) {
    out.push({
      level: 'warning',
      code: 'barcode-fit',
      message: 'The back cover is narrower than KDP’s 2" barcode box plus margins.',
    });
  }

  return out;
}
