import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, loadState, reconcileBinding } from '../src/app/state';

describe('app state', () => {
  it('falls back to defaults when storage is unavailable (as in Node)', () => {
    const s = loadState();
    expect(s.binding).toBe('paperback');
    expect(s.trimId).toBe('6x9');
    expect(s.mockup.aspect).toBe('1:1'); // square output is the default
    expect(s.ebook).toMatchObject({ width: 1600, height: 2560 });
  });

  it('moves to a valid trim size and paper when the binding changes', () => {
    const s = structuredClone(DEFAULT_STATE);
    s.trimId = '5x8';
    s.paper = 'bw-groundwood';
    s.binding = 'hardcover';
    reconcileBinding(s);
    expect(s.trimId).toBe('6x9'); // 5 x 8 is not a hardcover size
    expect(s.paper).toBe('bw-white'); // groundwood is paperback only

    s.trimId = '8.25x11';
    reconcileBinding(s);
    expect(s.trimId).toBe('8.25x11'); // hardcover size is kept
    s.binding = 'paperback';
    reconcileBinding(s);
    expect(s.trimId).toBe('6x9'); // 8.25 x 11 is not a paperback size
  });

  it('keeps a custom paperback size but not a custom hardcover size', () => {
    const s = structuredClone(DEFAULT_STATE);
    s.trimId = 'custom';
    reconcileBinding(s);
    expect(s.trimId).toBe('custom');
    s.binding = 'hardcover';
    reconcileBinding(s);
    expect(s.trimId).toBe('6x9');
  });
});
