import { describe, expect, it } from 'vitest';
import { gutterMargin, interiorLayout } from '../src/core/interior';
import { formatLength, formatLengthAll, formatSize, round, toInches, inchesTo } from '../src/core/units';

describe('interior margins (KDP gutter chart)', () => {
  it.each([
    [24, 0.375],
    [150, 0.375],
    [151, 0.5],
    [300, 0.5],
    [301, 0.625],
    [500, 0.625],
    [501, 0.75],
    [700, 0.75],
    [701, 0.875],
    [828, 0.875],
  ])('%i pages -> %f" gutter', (pages, gutter) => {
    expect(gutterMargin(pages)).toBe(gutter);
  });

  it('rejects page counts KDP does not allow', () => {
    expect(() => gutterMargin(23)).toThrow(RangeError);
    expect(() => gutterMargin(829)).toThrow(RangeError);
    expect(() => gutterMargin(100.5)).toThrow(RangeError);
  });

  it('computes page size and safe area, with and without bleed', () => {
    const nb = interiorLayout(6, 9, 333, false);
    expect(nb.pageWidth).toBe(6);
    expect(nb.margins).toEqual({ inside: 0.625, outside: 0.25, top: 0.25, bottom: 0.25 });
    // NOTE: KDP's calculator shows 5.375" here because it reads the wrong lookup column
    // (see docs/KDP-SPECS.md). The correct figure is 6 - 0.625 - 0.25.
    expect(nb.safeWidth).toBe(5.125);
    expect(nb.safeHeight).toBe(8.5);

    const b = interiorLayout(6, 9, 333, true);
    expect(b.pageWidth).toBe(6.125);
    expect(b.pageHeight).toBe(9.25);
    expect(b.margins.outside).toBe(0.375);
    expect(b.safeWidth).toBe(5.125);
    expect(b.safeHeight).toBe(8.5);
  });
});

describe('units', () => {
  it('rounds half away from zero like Excel', () => {
    expect(round(0.099088)).toBe(0.09909);
    expect(round(2.5, 0)).toBe(3);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(1.005, 2)).toBe(1.01);
  });

  it('converts between units', () => {
    expect(inchesTo('mm', 1)).toBe(25.4);
    expect(inchesTo('cm', 6)).toBeCloseTo(15.24);
    expect(toInches('cm', 15.24)).toBeCloseTo(6);
    expect(toInches('mm', 25.4)).toBeCloseTo(1);
  });

  it('formats lengths without float noise', () => {
    expect(formatLength(0.8325, 'in')).toBe('0.8325"');
    expect(formatLength(6, 'in')).toBe('6"');
    expect(formatLength(6, 'cm')).toBe('15.24 cm');
    expect(formatLength(0.8325, 'mm')).toBe('21.146 mm');
    expect(formatLength(0.1 + 0.2, 'in')).toBe('0.3"');
    expect(formatLengthAll(6, 'in')).toBe('6" (15.24 cm / 152.4 mm)');
    expect(formatSize(13.0825, 9.25, 'in')).toBe('13.0825" x 9.25"');
    expect(formatSize(13.0825, 9.25, 'cm')).toBe('33.2296 cm x 23.495 cm');
  });
});
