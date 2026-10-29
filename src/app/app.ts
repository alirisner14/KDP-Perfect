import type { CoverLayout } from '../core';
import { initBookPanel, type BookResult } from './book';
import type { Ctx, Screen } from './context';
import { $ } from './dom';
import { initCoverScreen } from './screens/cover';
import { initEbookScreen } from './screens/ebook';
import { initMockupScreen } from './screens/mockup';
import { initPreflightScreen } from './screens/preflight';
import { loadState, saveState, type ScreenId } from './state';

const SCREENS: ScreenId[] = ['cover', 'ebook', 'preflight', 'mockup'];

export function initApp(): void {
  const state = loadState();
  let book: BookResult = { layout: null, problems: [] };
  let active: ScreenId = state.screen;
  const screens = new Map<ScreenId, Screen>();
  const dirty = new Set<ScreenId>(SCREENS);

  const layout = (): CoverLayout | null => book.layout;
  const save = () => saveState(state);

  /** The book panel changed (or a screen asked for a refresh): recompute, then redraw what is showing. */
  function onBookChange(): void {
    book = panel.result();
    save();
    for (const id of SCREENS) {
      if (id === active) {
        screens.get(id)?.refresh();
        dirty.delete(id);
      } else {
        dirty.add(id);
      }
    }
  }

  const panel = initBookPanel(state, onBookChange);
  const ctx: Ctx = {
    state,
    save,
    layout,
    refresh: onBookChange,
    setUnit: (u) => {
      panel.setUnit(u);
      onBookChange();
    },
  };

  for (const s of [initCoverScreen(ctx), initEbookScreen(ctx), initPreflightScreen(ctx), initMockupScreen(ctx)]) screens.set(s.id, s);

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-screen]'));
  const bookPanel = document.querySelector<HTMLElement>('[data-panel="book"]')!;
  const ebookPanel = document.querySelector<HTMLElement>('[data-panel="ebook"]')!;

  function show(id: ScreenId): void {
    const previous = active;
    if (previous !== id) screens.get(previous)?.deactivate?.();
    active = id;
    state.screen = id;
    save();
    for (const t of tabs) {
      if (t.dataset.tab === id) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    }
    for (const s of sections) s.hidden = s.dataset.screen !== id;
    bookPanel.hidden = id === 'ebook';
    ebookPanel.hidden = id !== 'ebook';
    const screen = screens.get(id);
    if (dirty.has(id)) {
      screen?.refresh();
      dirty.delete(id);
    }
    screen?.activate?.();
  }

  for (const t of tabs) t.addEventListener('click', () => show(t.dataset.tab as ScreenId));

  book = panel.result();
  show(active);
  $('main');
}
