import { describe, expect, it } from 'vitest';
import golden from './fixtures/calculator-golden.json';
import { computeCoverLayout } from '../src/core/cover';
import { COVER_SAFE_MARGIN_CONSERVATIVE, TRIM_SIZES, getPaper, getTrimSize, maxPageCount } from '../src/core/specs';

const close = (a: number, b: number, digits = 5) => expect(a).toBeCloseTo(b, digits);

describe('cover layout vs. Amazon KDP Print File Setup Calculator V5', () => {
  // The workbook's cached state is 333 pages, black ink + cream paper.
  describe.each(golden.trims)('trim $width x $height @ 333 pp cream', (g) => {
    const layout = computeCoverLayout({
      trimWidth: g.width,
      trimHeight: g.height,
      pageCount: golden.pageCount,
      paper: 'bw-cream',
      readingDirection: 'ltr',
    });

    it('full cover canvas matches', () => {
      close(layout.canvas.w, g.coverWidth);
      close(layout.canvas.h, g.coverHeight);
    });

    it('overall safe zone matches', () => {
      close(layout.safe.overall.w, g.coverSafeWidth);
      close(layout.safe.overall.h, g.coverSafeHeight);
    });
  });

  it('spine width and spine text width match the calculator (6 x 9, 333 pp, cream)', () => {
    const l = computeCoverLayout({ trimWidth: 6, trimHeight: 9, pageCount: 333, paper: 'bw-cream', readingDirection: 'ltr' });
    close(l.spineWidth, 0.8325);
    close(l.spineTextWidth, 0.7075);
    close(l.canvas.w, 13.0825);
    close(l.canvas.h, 9.25);
  });

  it('matches the calculator screenshot: 8.5 x 8.5, 44 pp, white paper', () => {
    const l = computeCoverLayout({ trimWidth: 8.5, trimHeight: 8.5, pageCount: 44, paper: 'bw-white', readingDirection: 'ltr' });
    close(l.spineWidth, 0.09909);
    close(l.spineTextWidth, -0.02591); // negative: calculator shows it as-is
    close(l.canvas.w, 17.34909);
    close(l.canvas.h, 8.75);
    close(l.safe.overall.w, 16.84909);
    close(l.safe.overall.h, 8.25);
  });

  it('max page counts in specs.ts match the calculator table', () => {
    for (const g of golden.trims) {
      const trim = TRIM_SIZES.find((t) => t.width === g.width && t.height === g.height);
      expect(trim, `${g.width}x${g.height} missing from TRIM_SIZES`).toBeDefined();
      expect(maxPageCount(trim, getPaper('bw-cream'))).toBe(g.maxPages.cream);
      expect(maxPageCount(trim, getPaper('bw-white'))).toBe(g.maxPages.white);
      // The calculator stores 0 for "not available" (A4 color).
      expect(maxPageCount(trim, getPaper('color-premium'))).toBe(g.maxPages.color === 0 ? null : g.maxPages.color);
    }
  });
});

describe('cover layout geometry', () => {
  const ltr = computeCoverLayout({ trimWidth: 6, trimHeight: 9, pageCount: 200, paper: 'bw-white', readingDirection: 'ltr' });
  const rtl = computeCoverLayout({ trimWidth: 6, trimHeight: 9, pageCount: 200, paper: 'bw-white', readingDirection: 'rtl' });

  it('lays out back | spine | front left-to-right with 0.125" bleed', () => {
    close(ltr.back.x, 0.125);
    close(ltr.spine.x, 6.125);
    close(ltr.front.x, 6.125 + ltr.spineWidth);
    close(ltr.front.x + ltr.front.w + 0.125, ltr.canvas.w);
    expect(ltr.back.h).toBe(9);
  });

  it('mirrors the panels for right-to-left books', () => {
    close(rtl.front.x, 0.125);
    close(rtl.back.x, rtl.spine.x + rtl.spine.w);
    close(rtl.canvas.w, ltr.canvas.w);
  });

  it('keeps the barcode on the back cover, 0.25" from the spine and the bottom trim', () => {
    // LTR: back is on the left, barcode right edge sits 0.25" before the spine fold.
    close(ltr.barcode.x + ltr.barcode.w, ltr.spine.x - 0.25);
    close(ltr.barcode.y + ltr.barcode.h, ltr.trim.y + ltr.trim.h - 0.25);
    expect(ltr.barcode.x).toBeGreaterThan(ltr.back.x);
    // RTL: back is on the right, barcode left edge sits 0.25" after the spine.
    close(rtl.barcode.x, rtl.spine.x + rtl.spine.w + 0.25);
    expect(rtl.barcode.x + rtl.barcode.w).toBeLessThan(rtl.back.x + rtl.back.w);
  });

  it('puts the spine text zone 0.0625" inside each fold', () => {
    const s = ltr.safe.spineText!;
    close(s.x, ltr.spine.x + 0.0625);
    close(s.w, ltr.spine.w - 0.125);
    close(s.y, 0.25);
    close(s.h, ltr.canvas.h - 0.5);
  });

  it('keeps front/back safe boxes inside their trim box and clear of the spine fold', () => {
    for (const [safe, panel] of [
      [ltr.safe.back, ltr.back],
      [ltr.safe.front, ltr.front],
    ] as const) {
      expect(safe.x).toBeGreaterThanOrEqual(panel.x - 0.126); // outer edge: 0.125" inside trim
      expect(safe.x + safe.w).toBeLessThanOrEqual(panel.x + panel.w + 0.126);
      expect(safe.y).toBeCloseTo(0.25);
    }
    close(ltr.safe.back.x + ltr.safe.back.w, ltr.spine.x - 0.125);
    close(ltr.safe.front.x, ltr.spine.x + ltr.spine.w + 0.125);
    close(ltr.safe.back.x, 0.25); // 0.25" from the outer canvas edge
    close(ltr.safe.front.x + ltr.safe.front.w, ltr.canvas.w - 0.25);
  });

  it('supports the conservative (0.25" inside trim) safe margin', () => {
    const c = computeCoverLayout({
      trimWidth: 6,
      trimHeight: 9,
      pageCount: 200,
      paper: 'bw-white',
      readingDirection: 'ltr',
      safeMargin: COVER_SAFE_MARGIN_CONSERVATIVE,
    });
    close(c.safe.overall.x, 0.375);
    close(c.safe.overall.w, c.canvas.w - 0.75);
  });

  it('lists guides in ascending order', () => {
    for (const axis of [ltr.guides.vertical, ltr.guides.horizontal]) {
      const at = axis.map((g) => g.at);
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
    expect(ltr.guides.vertical[0]!.at).toBe(0);
    close(ltr.guides.vertical.at(-1)!.at, ltr.canvas.w);
  });
});

describe('validation', () => {
  const base = { trimWidth: 6, trimHeight: 9, paper: 'bw-white', readingDirection: 'ltr', trimId: '6x9' } as const;
  const codes = (pageCount: number, extra: Partial<Parameters<typeof computeCoverLayout>[0]> = {}) =>
    computeCoverLayout({ ...base, pageCount, ...extra }).warnings.map((w) => w.code);

  it('rejects fewer than 24 pages', () => {
    const l = computeCoverLayout({ ...base, pageCount: 20 });
    expect(l.valid).toBe(false);
    expect(l.warnings.map((w) => w.code)).toContain('pages-min');
  });

  it('rejects more pages than the size allows', () => {
    expect(codes(829)).toContain('pages-max');
    expect(codes(828)).not.toContain('pages-max');
    expect(codes(777, { paper: 'bw-cream' })).toContain('pages-max');
    expect(codes(600, { trimId: '8.5x8.5' })).toContain('pages-max');
  });

  it('rejects non-integer page counts', () => {
    expect(codes(100.5)).toContain('pages-invalid');
  });

  it('disables spine text under 79 pages but still reports the spine', () => {
    const l = computeCoverLayout({ ...base, pageCount: 78 });
    expect(l.safe.spineText).toBeNull();
    expect(l.spineTextAllowed).toBe(false);
    expect(l.warnings.map((w) => w.code)).toContain('spine-text-min-pages');
    expect(l.valid).toBe(true);
    expect(computeCoverLayout({ ...base, pageCount: 79 }).safe.spineText).not.toBeNull();
  });

  it('flags color printing on A4 as unavailable', () => {
    const l = computeCoverLayout({
      trimWidth: 8.27,
      trimHeight: 11.69,
      pageCount: 100,
      paper: 'color-premium',
      readingDirection: 'ltr',
      trimId: '8.27x11.69',
    });
    expect(l.valid).toBe(false);
    expect(l.warnings.map((w) => w.code)).toContain('paper-unavailable');
  });

  it('only softly warns about odd custom trim sizes', () => {
    const l = computeCoverLayout({ ...base, trimId: undefined, trimWidth: 3, trimHeight: 5, pageCount: 100 });
    expect(l.valid).toBe(true);
    expect(l.warnings.map((w) => w.code)).toContain('trim-custom-range');
  });

  it('errors on non-positive custom sizes', () => {
    const l = computeCoverLayout({ ...base, trimId: undefined, trimWidth: 0, trimHeight: 9, pageCount: 100 });
    expect(l.valid).toBe(false);
  });

  it('every preset trim size is resolvable', () => {
    for (const t of TRIM_SIZES) expect(getTrimSize(t.id)).toBe(t);
  });
});
