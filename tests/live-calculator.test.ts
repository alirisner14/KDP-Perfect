import { describe, expect, it } from 'vitest';
import live from './fixtures/kdp-live-calculator.json';
import { computeCoverLayout } from '../src/core/cover';
import type { PaperId } from '../src/core/specs';
import { HARDCOVER_TRIM_SIZES, TRIM_SIZES, getTrimSize, papersFor, trimSizesFor } from '../src/core/specs';

/** KDP's calculator shows three decimals; allow for that rounding only. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(0.0015);

describe('hardcover vs. KDP live calculator (2026-10-29)', () => {
  describe.each(live.hardcover)('$trim $paper $pages pp', (c) => {
    const trim = getTrimSize(c.trim, 'hardcover')!;
    const l = computeCoverLayout({
      binding: 'hardcover',
      trimWidth: trim.width,
      trimHeight: trim.height,
      trimId: trim.id,
      pageCount: c.pages,
      paper: c.paper as PaperId,
      readingDirection: 'ltr',
    });

    it('is valid and matches the full cover size', () => {
      expect(l.valid, JSON.stringify(l.warnings)).toBe(true);
      near(l.canvas.w, c.fullW);
      near(l.canvas.h, c.fullH);
    });

    it('matches the board and spine', () => {
      near(l.panel.w, c.boardW);
      near(l.panel.h, c.boardH);
      near(l.spineWidth, c.spine);
      near(l.spine.h, c.boardH);
    });

    it('matches the spine safe area', () => {
      near(l.safe.spineText!.w, c.spineSafeW);
      near(l.safe.spineText!.h, c.spineSafeH);
    });
  });

  const hc = computeCoverLayout({ binding: 'hardcover', trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 200, paper: 'bw-white', readingDirection: 'ltr' });

  it('uses KDP wrap, hinge and margin', () => {
    near(hc.bleed, 0.591);
    near(hc.hinge, 0.394);
    expect(hc.ringName).toBe('Wrap');
    near(hc.trim.x, 0.591);
    near(hc.trim.y, 0.591);
  });

  it('keeps the front and back safe areas 0.125" inside the board and a hinge away from the spine', () => {
    near(hc.safe.back.x, 0.591 + 0.125);
    near(hc.safe.back.x + hc.safe.back.w, hc.spine.x - 0.394);
    near(hc.safe.front.x, hc.spine.x + hc.spine.w + 0.394);
    near(hc.safe.front.x + hc.safe.front.w, hc.canvas.w - 0.591 - 0.125);
    near(hc.safe.back.y, 0.591 + 0.125);
    near(hc.safe.back.h, 9.236 - 0.25);
  });

  it('places the barcode 0.375" above the board bottom and 0.25" beyond the hinge', () => {
    near(hc.barcode.y + hc.barcode.h, hc.trim.y + hc.trim.h - 0.375);
    near(hc.barcode.x + hc.barcode.w, hc.spine.x - 0.394 - 0.25);
    expect(hc.barcode.x).toBeGreaterThan(hc.back.x);
  });

  it('has hinge bands beside the spine and mirrors for right-to-left', () => {
    expect(hc.hingeBands).toHaveLength(2);
    near(hc.hingeBands[0]!.x + hc.hingeBands[0]!.w, hc.spine.x);
    near(hc.hingeBands[1]!.x, hc.spine.x + hc.spine.w);
    const rtl = computeCoverLayout({ binding: 'hardcover', trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 200, paper: 'bw-white', readingDirection: 'rtl' });
    near(rtl.canvas.w, hc.canvas.w);
    expect(rtl.front.x).toBeLessThan(rtl.back.x);
    near(rtl.barcode.x, rtl.spine.x + rtl.spine.w + 0.394 + 0.25);
  });

  it('enforces the 76-550 page range', () => {
    const codes = (pages: number) =>
      computeCoverLayout({ binding: 'hardcover', trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: pages, paper: 'bw-white', readingDirection: 'ltr' }).warnings.map((w) => w.code);
    expect(codes(75)).toContain('pages-min');
    expect(codes(76)).not.toContain('pages-min');
    expect(codes(550)).not.toContain('pages-max');
    expect(codes(551)).toContain('pages-max');
  });

  it('rejects custom sizes and paper KDP does not offer for hardcover', () => {
    const custom = computeCoverLayout({ binding: 'hardcover', trimWidth: 5, trimHeight: 8, pageCount: 100, paper: 'bw-white', readingDirection: 'ltr' });
    expect(custom.valid).toBe(false);
    expect(custom.warnings.map((w) => w.code)).toContain('trim-not-hardcover');
    for (const paper of ['bw-groundwood', 'color-standard'] as const) {
      const l = computeCoverLayout({ binding: 'hardcover', trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 100, paper, readingDirection: 'ltr' });
      expect(l.valid).toBe(false);
    }
    expect(papersFor('hardcover').map((p) => p.id)).toEqual(['bw-white', 'bw-cream', 'color-premium']);
  });

  it('allows spine text at the minimum page count (spine is wide enough)', () => {
    const l = computeCoverLayout({ binding: 'hardcover', trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 76, paper: 'bw-white', readingDirection: 'ltr' });
    expect(l.safe.spineText).not.toBeNull();
  });
});

describe('paperback vs. KDP live calculator (2026-10-29)', () => {
  describe.each(live.paperback)('$trim $paper $pages pp', (c) => {
    const trim = getTrimSize(c.trim, 'paperback')!;
    const l = computeCoverLayout({ trimWidth: trim.width, trimHeight: trim.height, trimId: trim.id, pageCount: c.pages, paper: c.paper as PaperId, readingDirection: 'ltr' });
    it('matches full cover and spine', () => {
      near(l.canvas.w, c.fullW);
      near(l.canvas.h, c.fullH);
      near(l.spineWidth, c.spine);
    });
  });

  it.each(live.paperbackCustom)('custom $w x $h matches', (c) => {
    const l = computeCoverLayout({ trimWidth: c.w, trimHeight: c.h, pageCount: c.pages, paper: c.paper as PaperId, readingDirection: 'ltr' });
    expect(l.valid).toBe(true);
    near(l.canvas.w, c.fullW);
    near(l.canvas.h, c.fullH);
  });

  it('rejects custom sizes outside KDP’s 4-8.5 x 6-11.69 window (as the calculator does)', () => {
    for (const [w, h] of [
      [3.9, 8],
      [8.6, 9],
      [6, 5.9],
      [6, 11.7],
    ] as const) {
      const l = computeCoverLayout({ trimWidth: w, trimHeight: h, pageCount: 120, paper: 'bw-white', readingDirection: 'ltr' });
      expect(l.valid, `${w}x${h}`).toBe(false);
      expect(l.warnings.map((x) => x.code)).toContain('trim-custom-range');
    }
  });

  it('knows the preset lists KDP offers', () => {
    expect(TRIM_SIZES.map((t) => t.id)).not.toContain('8.25x11'); // hardcover only
    expect(HARDCOVER_TRIM_SIZES.map((t) => t.id)).toContain('8.25x11');
    expect(trimSizesFor('paperback')).toBe(TRIM_SIZES);
    expect(papersFor('paperback').map((p) => p.id)).toEqual(['bw-white', 'bw-cream', 'bw-groundwood', 'color-premium', 'color-standard']);
  });
});
