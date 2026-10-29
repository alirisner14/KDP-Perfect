import { PAPER_TYPES, CUSTOM_TRIM_ID, getTrimSize, papersFor, type Binding, type PaperId } from '../core/specs';
import { UNITS, type Unit } from '../core/units';
import type { ReadingDirection } from '../core/cover';
import type { ExportFormat } from '../core/summary';
import type { SceneMode } from '../core/scene';
import { ASPECTS, BACKGROUNDS, LONG_SIDES, POSES, type PoseId } from '../core/mockup';

export type SafeChoice = 'standard' | 'conservative';
export type Dpi = 150 | 300;
export type ScreenId = 'cover' | 'ebook' | 'preflight' | 'mockup';
export type EbookPreset = 'ideal' | 'hd' | 'min' | 'custom';

export interface EbookState {
  preset: EbookPreset;
  width: number;
  height: number;
  variant: SceneMode;
  format: 'png' | 'jpg';
}

export interface MockupState {
  source: 'wrap' | 'front';
  pose: PoseId;
  aspect: string;
  longSide: number;
  background: string;
  finish: 'matte' | 'glossy';
  shadow: boolean;
  crease: boolean;
  format: 'png' | 'jpg';
}

export interface AppState {
  screen: ScreenId;
  binding: Binding;
  /** A preset id for the binding, or `custom` (paperback only). */
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
  /** Cover screen: which version is previewed and downloaded. */
  variant: SceneMode;
  format: ExportFormat;
  ebook: EbookState;
  mockup: MockupState;
}

export const DEFAULT_STATE: AppState = {
  screen: 'cover',
  binding: 'paperback',
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
  ebook: { preset: 'ideal', width: 1600, height: 2560, variant: 'template', format: 'jpg' },
  mockup: {
    source: 'wrap',
    pose: 'hero',
    aspect: '1:1',
    longSide: 2000,
    background: 'studio',
    finish: 'matte',
    shadow: true,
    crease: true,
    format: 'png',
  },
};

const KEY = 'kdp-perfect.v2';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Make sure the trim size and paper are ones the binding actually offers. */
export function reconcileBinding(s: AppState): void {
  if (s.trimId !== CUSTOM_TRIM_ID || s.binding === 'hardcover') {
    if (!getTrimSize(s.trimId, s.binding)) s.trimId = '6x9';
  }
  if (!papersFor(s.binding).some((p) => p.id === s.paper)) s.paper = 'bw-white';
}

/** Read saved settings, ignoring anything that no longer validates. */
export function loadState(): AppState {
  const s: AppState = structuredClone(DEFAULT_STATE);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (['cover', 'ebook', 'preflight', 'mockup'].includes(o.screen as string)) s.screen = o.screen as ScreenId;
    if (o.binding === 'paperback' || o.binding === 'hardcover') s.binding = o.binding;
    if (typeof o.trimId === 'string') s.trimId = o.trimId;
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

    if (isRec(o.ebook)) {
      const e = o.ebook;
      if (['ideal', 'hd', 'min', 'custom'].includes(e.preset as string)) s.ebook.preset = e.preset as EbookPreset;
      if (isNum(e.width) && e.width > 0) s.ebook.width = Math.round(e.width);
      if (isNum(e.height) && e.height > 0) s.ebook.height = Math.round(e.height);
      if (e.variant === 'template' || e.variant === 'overlay') s.ebook.variant = e.variant;
      if (e.format === 'png' || e.format === 'jpg') s.ebook.format = e.format;
      if (s.ebook.variant === 'overlay' && s.ebook.format === 'jpg') s.ebook.format = 'png';
    }
    if (isRec(o.mockup)) {
      const m = o.mockup;
      if (m.source === 'wrap' || m.source === 'front') s.mockup.source = m.source;
      if (POSES.some((p) => p.id === m.pose)) s.mockup.pose = m.pose as PoseId;
      if (ASPECTS.some((a) => a.id === m.aspect)) s.mockup.aspect = m.aspect as string;
      if (LONG_SIDES.includes(m.longSide as (typeof LONG_SIDES)[number])) s.mockup.longSide = m.longSide as number;
      if (BACKGROUNDS.some((b) => b.id === m.background)) s.mockup.background = m.background as string;
      if (m.finish === 'matte' || m.finish === 'glossy') s.mockup.finish = m.finish;
      if (typeof m.shadow === 'boolean') s.mockup.shadow = m.shadow;
      if (typeof m.crease === 'boolean') s.mockup.crease = m.crease;
      if (m.format === 'png' || m.format === 'jpg') s.mockup.format = m.format;
    }
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  reconcileBinding(s);
  return s;
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Not fatal: settings simply won't persist.
  }
}
