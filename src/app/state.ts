import { PAPER_TYPES, TRIM_SIZES, CUSTOM_TRIM_ID, type PaperId } from '../core/specs';
import { UNITS, type Unit } from '../core/units';
import type { ReadingDirection } from '../core/cover';
import type { ExportFormat } from '../core/summary';
import type { SceneMode } from '../core/scene';

export type SafeChoice = 'standard' | 'conservative';
export type Dpi = 150 | 300;

export interface AppState {
  /** A preset id from TRIM_SIZES, or `custom`. */
  trimId: string;
  /** Custom trim size, always stored in inches. */
  customWidth: number;
  customHeight: number;
  paper: PaperId;
  /** `null` while the field is empty or not a number. */
  pages: number | null;
  direction: ReadingDirection;
  safe: SafeChoice;
  dpi: Dpi;
  unit: Unit;
  /** Which version is previewed and downloaded. */
  variant: SceneMode;
  format: ExportFormat;
}

export const DEFAULT_STATE: AppState = {
  trimId: '6x9',
  customWidth: 5.5,
  customHeight: 8.25,
  paper: 'bw-white',
  pages: 200,
  direction: 'ltr',
  safe: 'standard',
  dpi: 300,
  unit: 'in',
  variant: 'template',
  format: 'png',
};

const KEY = 'kdp-perfect.cover.v1';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Read saved settings, ignoring anything that no longer validates. */
export function loadState(): AppState {
  const s: AppState = { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const o = JSON.parse(raw) as Partial<Record<keyof AppState, unknown>>;
    if (typeof o.trimId === 'string' && (o.trimId === CUSTOM_TRIM_ID || TRIM_SIZES.some((t) => t.id === o.trimId))) s.trimId = o.trimId;
    if (isNum(o.customWidth) && o.customWidth > 0) s.customWidth = o.customWidth;
    if (isNum(o.customHeight) && o.customHeight > 0) s.customHeight = o.customHeight;
    if (PAPER_TYPES.some((p) => p.id === o.paper)) s.paper = o.paper as PaperId;
    if (o.pages === null || isNum(o.pages)) s.pages = o.pages;
    if (o.direction === 'ltr' || o.direction === 'rtl') s.direction = o.direction;
    if (o.safe === 'standard' || o.safe === 'conservative') s.safe = o.safe;
    if (o.dpi === 150 || o.dpi === 300) s.dpi = o.dpi;
    if (UNITS.includes(o.unit as Unit)) s.unit = o.unit as Unit;
    if (o.variant === 'template' || o.variant === 'overlay') s.variant = o.variant;
    if (o.format === 'png' || o.format === 'jpg' || o.format === 'pdf') s.format = o.format;
    if (s.variant === 'overlay' && s.format === 'jpg') s.format = 'png'; // JPG cannot be transparent
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return s;
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Not fatal: settings simply won't persist.
  }
}
