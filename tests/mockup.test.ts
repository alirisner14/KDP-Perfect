import { describe, expect, it } from 'vitest';
import { computeCoverLayout } from '../src/core/cover';
import { ASPECTS, BACKGROUNDS, LONG_SIDES, bookDims, frontAspect, getAspect, getBackground, outputSize, pageEdgeColor, wrapRegions } from '../src/core/mockup';

const pb = computeCoverLayout({ trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 200, paper: 'bw-cream', readingDirection: 'ltr' });
const hc = computeCoverLayout({ binding: 'hardcover', trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 200, paper: 'bw-white', readingDirection: 'rtl' });

describe('mockup geometry', () => {
  it('uses the trim size and spine for paperbacks', () => {
    const d = bookDims(pb);
    expect(d).toMatchObject({ width: 6, height: 9, hardcover: false, spineSide: -1 });
    expect(d.depth).toBeCloseTo(0.5, 5);
  });

  it('uses the board size and the case spine for hardcovers, with the spine on the right for RTL', () => {
    const d = bookDims(hc);
    expect(d.width).toBeCloseTo(6.19685, 4);
    expect(d.height).toBeCloseTo(9.23622, 4);
    expect(d.depth).toBeCloseTo(0.6394, 3);
    expect(d).toMatchObject({ hardcover: true, spineSide: 1 });
  });

  it('slices the wrap into back | spine | front fractions that tile the trim area', () => {
    const r = wrapRegions(pb);
    expect(r.back.x).toBeCloseTo(0.125 / pb.canvas.w, 6);
    expect(r.back.x + r.back.w).toBeCloseTo(r.spine.x, 6);
    expect(r.spine.x + r.spine.w).toBeCloseTo(r.front.x, 6);
    expect(r.front.x + r.front.w).toBeCloseTo(1 - 0.125 / pb.canvas.w, 6);
    expect(r.front.h).toBeCloseTo(9 / pb.canvas.h, 6);
    for (const p of Object.values(r)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('puts the front on the left for RTL books', () => {
    const r = wrapRegions(hc);
    expect(r.front.x).toBeLessThan(r.spine.x);
    expect(r.back.x).toBeGreaterThan(r.spine.x);
  });

  it('colours the page edges by paper', () => {
    expect(pageEdgeColor(pb)).toBe('#EFE6CF');
    expect(pageEdgeColor(hc)).toBe('#F7F6F2');
  });

  it('knows the front aspect ratio', () => {
    expect(frontAspect(pb)).toBeCloseTo(6 / 9, 4);
  });
});

describe('mockup output sizes', () => {
  it('gives exact square output, with the long side as asked', () => {
    expect(outputSize('1:1', 2000)).toEqual({ w: 2000, h: 2000 });
    expect(outputSize('4:5', 2000)).toEqual({ w: 1600, h: 2000 });
    expect(outputSize('3:2', 3000)).toEqual({ w: 3000, h: 2000 });
    expect(outputSize('16:9', 1920)).toEqual({ w: 1920, h: 1080 });
  });

  it('is consistent for every aspect and size', () => {
    for (const a of ASPECTS) {
      for (const s of LONG_SIDES) {
        const { w, h } = outputSize(a.id, s);
        expect(Math.max(w, h)).toBe(s);
        expect(Math.abs(w / h - a.w / a.h)).toBeLessThan(0.002);
      }
    }
  });

  it('falls back to square for unknown ids and lists the presets', () => {
    expect(getAspect('nope').id).toBe('1:1');
    expect(getBackground('nope').id).toBe('studio');
    expect(BACKGROUNDS.some((b) => b.from === null)).toBe(true);
  });
});
