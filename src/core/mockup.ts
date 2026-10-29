/**
 * Pure helpers for the 3D book mockup: the book's physical size, where the back/spine/front sit inside a
 * full-wrap cover image, and the output sizes for each aspect ratio. The three.js scene itself lives in
 * `src/app/mockup/` because it needs WebGL.
 */

import type { CoverLayout } from './cover';
import { getPaper } from './specs';
import { round } from './units';

export interface BookDims {
  /** Cover width, height and thickness in inches. */
  width: number;
  height: number;
  depth: number;
  hardcover: boolean;
  /** -1: spine on the left of the front cover (left-to-right books); 1: on the right. */
  spineSide: -1 | 1;
}

export function bookDims(layout: CoverLayout): BookDims {
  return {
    width: layout.panel.w,
    height: layout.panel.h,
    depth: layout.spineWidth,
    hardcover: layout.binding === 'hardcover',
    spineSide: layout.input.readingDirection === 'ltr' ? -1 : 1,
  };
}

/** A rectangle expressed as fractions (0..1) of the full-wrap image, y-down. */
export interface UvRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where each panel sits inside a full-wrap cover image. The mapping is proportional, so it works for any
 * resolution of an image that has the canvas's proportions (the wrap or bleed is simply left out).
 */
export function wrapRegions(layout: CoverLayout): { back: UvRect; spine: UvRect; front: UvRect } {
  const { canvas } = layout;
  const norm = (r: { x: number; y: number; w: number; h: number }): UvRect => ({
    x: r.x / canvas.w,
    y: r.y / canvas.h,
    w: r.w / canvas.w,
    h: r.h / canvas.h,
  });
  return { back: norm(layout.back), spine: norm(layout.spine), front: norm(layout.front) };
}

/** Page-edge colour for the paper (the block of pages visible on three sides). */
export function pageEdgeColor(layout: CoverLayout): string {
  return layout.input.paper === 'bw-cream' ? '#EFE6CF' : layout.input.paper === 'bw-groundwood' ? '#E4DCC4' : '#F7F6F2';
}

export function paperThickness(layout: CoverLayout): number {
  return getPaper(layout.input.paper).thickness;
}

// --- Output ----------------------------------------------------------------------------------

export interface Aspect {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const ASPECTS: readonly Aspect[] = [
  { id: '1:1', label: 'Square 1:1', w: 1, h: 1 },
  { id: '4:5', label: 'Portrait 4:5', w: 4, h: 5 },
  { id: '2:3', label: 'Tall 2:3', w: 2, h: 3 },
  { id: '3:2', label: 'Landscape 3:2', w: 3, h: 2 },
  { id: '16:9', label: 'Wide 16:9', w: 16, h: 9 },
];

export const LONG_SIDES = [1000, 1500, 2000, 3000, 4000] as const;

export function getAspect(id: string): Aspect {
  return ASPECTS.find((a) => a.id === id) ?? ASPECTS[0]!;
}

/** Pixel size for an aspect ratio whose longer side is `longSide` pixels. Always whole pixels. */
export function outputSize(aspectId: string, longSide: number): { w: number; h: number } {
  const a = getAspect(aspectId);
  const k = longSide / Math.max(a.w, a.h);
  return { w: Math.round(a.w * k), h: Math.round(a.h * k) };
}

export type PoseId = 'hero' | 'front' | 'back' | 'spine' | 'floating' | 'flat' | 'stack' | 'pair';

export const POSES: readonly { id: PoseId; label: string; hint: string }[] = [
  { id: 'hero', label: 'Standing', hint: 'Three-quarter view showing the front and spine' },
  { id: 'front', label: 'Front on', hint: 'Straight-on front cover with a soft shadow' },
  { id: 'floating', label: 'Floating', hint: 'Tilted and lifted off the surface' },
  { id: 'pair', label: 'Pair', hint: 'Two copies standing side by side' },
  { id: 'stack', label: 'Stack', hint: 'Three copies piled up' },
  { id: 'flat', label: 'Lying flat', hint: 'Seen from above at an angle' },
  { id: 'back', label: 'Back + spine', hint: 'Three-quarter view of the back cover' },
  { id: 'spine', label: 'Spine', hint: 'Spine facing the camera' },
];

export interface BackgroundPreset {
  id: string;
  label: string;
  /** `null` = transparent. */
  from: string | null;
  to?: string;
}

export const BACKGROUNDS: readonly BackgroundPreset[] = [
  { id: 'studio', label: 'Studio', from: '#F4F5F7', to: '#D9DCE3' },
  { id: 'white', label: 'White', from: '#FFFFFF' },
  { id: 'warm', label: 'Warm', from: '#FBF3E6', to: '#EBD9BE' },
  { id: 'mint', label: 'Mint', from: '#E6F4EF', to: '#BFE0D5' },
  { id: 'blush', label: 'Blush', from: '#FCEBEE', to: '#F3C9D1' },
  { id: 'night', label: 'Night', from: '#2B2E3B', to: '#14151C' },
  { id: 'clear', label: 'Transparent', from: null },
];

export function getBackground(id: string): BackgroundPreset {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]!;
}

/** Aspect ratio (w / h) of the front cover, used to crop a front-only upload to fit. */
export function frontAspect(layout: CoverLayout): number {
  return round(layout.panel.w / layout.panel.h, 5);
}
