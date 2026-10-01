/**
 * Unit helpers. Every measurement in the core is stored in INCHES (the unit KDP's own
 * calculator works in) and only converted for display or export.
 */

export type Unit = 'in' | 'cm' | 'mm';

export const UNITS: readonly Unit[] = ['in', 'cm', 'mm'];

export const MM_PER_INCH = 25.4;
export const CM_PER_INCH = 2.54;
export const PT_PER_INCH = 72;

/** Round half away from zero to `digits` decimals (matches Excel's ROUND, which KDP's calculator uses). */
export function round(value: number, digits = 5): number {
  const f = 10 ** digits;
  const scaled = Math.abs(value) * f * (1 + Number.EPSILON);
  const r = Math.round(scaled) / f;
  return value < 0 ? -r : r;
}

export function inchesTo(unit: Unit, inches: number): number {
  switch (unit) {
    case 'in':
      return inches;
    case 'cm':
      return inches * CM_PER_INCH;
    case 'mm':
      return inches * MM_PER_INCH;
  }
}

export function toInches(unit: Unit, value: number): number {
  switch (unit) {
    case 'in':
      return value;
    case 'cm':
      return value / CM_PER_INCH;
    case 'mm':
      return value / MM_PER_INCH;
  }
}

/** Maximum decimals shown per unit: enough to match KDP's calculator, no float noise. */
const DECIMALS: Record<Unit, number> = { in: 4, cm: 4, mm: 3 };

/** Number with trailing zeros trimmed, e.g. 6 -> "6", 0.8325 -> "0.8325". */
export function trimNumber(value: number, digits: number): string {
  const r = round(value, digits);
  // toFixed avoids exponent notation for tiny numbers; Number() strips trailing zeros.
  return String(Number(r.toFixed(digits)));
}

export function formatNumber(inches: number, unit: Unit): string {
  return trimNumber(inchesTo(unit, inches), DECIMALS[unit]);
}

/** `0.8325"`, `2.1145 cm`, `21.146 mm`. */
export function formatLength(inches: number, unit: Unit): string {
  const n = formatNumber(inches, unit);
  return unit === 'in' ? `${n}"` : `${n} ${unit}`;
}

/** Length in the chosen unit, followed by the other two in brackets: `0.8325" (2.1145 cm / 21.146 mm)`. */
export function formatLengthAll(inches: number, unit: Unit): string {
  const others = UNITS.filter((u) => u !== unit).map((u) => formatLength(inches, u));
  return `${formatLength(inches, unit)} (${others.join(' / ')})`;
}

/** `13.0825" x 9.25"` style size string. ASCII `x` so it survives PDF standard fonts. */
export function formatSize(wInches: number, hInches: number, unit: Unit): string {
  const suffix = unit === 'in' ? '"' : ` ${unit}`;
  return `${formatNumber(wInches, unit)}${suffix} x ${formatNumber(hInches, unit)}${suffix}`;
}

/** Pixel count for a length at a given DPI (canvases need whole pixels). */
export function toPixels(inches: number, dpi: number): number {
  return Math.round(inches * dpi);
}
