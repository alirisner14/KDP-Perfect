/**
 * The shared "Your book" panel: binding, trim size, ink and paper, page count and the advanced options.
 * Every screen that needs the book's measurements reads the layout this panel computes.
 */

import {
  COVER_SAFE_MARGIN,
  COVER_SAFE_MARGIN_CONSERVATIVE,
  CUSTOM_TRIM_ID,
  computeCoverLayout,
  formatSize,
  getPaper,
  getTrimSize,
  inchesTo,
  pageLimits,
  papersFor,
  toInches,
  trimNumber,
  trimSizesFor,
  UNITS,
  type Binding,
  type CoverLayout,
} from '../core';
import { $, esc, segment } from './dom';
import { reconcileBinding, type AppState, type SafeChoice } from './state';

export interface BookResult {
  layout: CoverLayout | null;
  /** Reasons there is no layout (empty fields etc.). Warnings live on the layout itself. */
  problems: string[];
}

export interface BookPanel {
  /** Re-read state into the form (e.g. after loading settings). */
  write(): void;
  /** Compute the layout for the current form values. */
  result(): BookResult;
  /** Switch the display unit, converting the custom-size inputs. */
  setUnit(unit: AppState['unit']): void;
}

export function initBookPanel(state: AppState, onChange: () => void): BookPanel {
  const el = {
    trim: $<HTMLSelectElement>('trim'),
    trimNote: $('trim-note'),
    customBox: $('custom-trim'),
    customW: $<HTMLInputElement>('custom-w'),
    customH: $<HTMLInputElement>('custom-h'),
    customUnit: $<HTMLSelectElement>('custom-unit'),
    paper: $('paper'),
    pages: $<HTMLInputElement>('pages'),
    pagesHint: $('pages-hint'),
    direction: $('direction'),
    safe: $<HTMLSelectElement>('safe'),
    safeField: $('safe-field'),
    messages: $('messages'),
  };

  const radio = (name: string, value: string, label: string, small = '') =>
    `<label class="radio"><input type="radio" name="${name}" value="${esc(value)}" /> <span>${esc(label)}</span>${small ? `<small>${esc(small)}</small>` : ''}</label>`;

  const bindingSeg = segment<Binding>(
    $('binding-toggle'),
    [
      { value: 'paperback', label: 'Paperback' },
      { value: 'hardcover', label: 'Hardcover' },
    ],
    () => state.binding,
    (b) => {
      state.binding = b;
      reconcileBinding(state);
      populate();
      write();
      commit();
    },
  );

  el.direction.innerHTML = radio('direction', 'ltr', 'Left to right', 'back | spine | front') + radio('direction', 'rtl', 'Right to left', 'front | spine | back');
  el.safe.innerHTML =
    `<option value="standard">KDP standard: ${COVER_SAFE_MARGIN}" from the edge</option>` +
    `<option value="conservative">Extra cautious: ${COVER_SAFE_MARGIN_CONSERVATIVE}" from the edge</option>`;
  el.customUnit.innerHTML = UNITS.map((u) => `<option value="${u}">${u}</option>`).join('');

  /** Rebuild the lists whose contents depend on the binding. */
  function populate(): void {
    const sizes = trimSizesFor(state.binding);
    el.trim.innerHTML =
      sizes.map((t) => `<option value="${esc(t.id)}">${esc(`${formatSize(t.width, t.height, 'in')} (${formatSize(t.width, t.height, 'cm')})`)}</option>`).join('') +
      (state.binding === 'paperback' ? `<option value="${CUSTOM_TRIM_ID}">Custom size&hellip;</option>` : '');
    el.paper.innerHTML = papersFor(state.binding)
      .map((p) => radio('paper', p.id, p.label, `${p.thickness}" / page`))
      .join('');
  }

  function write(): void {
    el.trim.value = state.trimId;
    el.pages.value = state.pages === null ? '' : String(state.pages);
    el.safe.value = state.safe;
    for (const r of el.paper.querySelectorAll<HTMLInputElement>('input')) r.checked = r.value === state.paper;
    for (const r of el.direction.querySelectorAll<HTMLInputElement>('input')) r.checked = r.value === state.direction;
    writeCustom();
  }

  function writeCustom(): void {
    el.customW.value = trimNumber(inchesTo(state.unit, state.customWidth), 4);
    el.customH.value = trimNumber(inchesTo(state.unit, state.customHeight), 4);
    el.customUnit.value = state.unit;
  }

  /** Custom size is parsed in the unit currently shown. Invalid input keeps the last good value. */
  function readCustom(): boolean {
    const w = el.customW.valueAsNumber;
    const h = el.customH.valueAsNumber;
    const okW = Number.isFinite(w) && w > 0;
    const okH = Number.isFinite(h) && h > 0;
    if (okW && okH) {
      state.customWidth = toInches(state.unit, w);
      state.customHeight = toInches(state.unit, h);
    }
    el.customW.setAttribute('aria-invalid', String(!okW));
    el.customH.setAttribute('aria-invalid', String(!okH));
    return okW && okH;
  }

  function read(): void {
    state.trimId = el.trim.value || state.trimId;
    const pages = el.pages.valueAsNumber;
    state.pages = Number.isFinite(pages) ? pages : null;
    const paper = el.paper.querySelector<HTMLInputElement>('input:checked');
    if (paper) state.paper = paper.value as AppState['paper'];
    const dir = el.direction.querySelector<HTMLInputElement>('input:checked');
    if (dir) state.direction = dir.value as AppState['direction'];
    state.safe = el.safe.value as SafeChoice;
    if (state.trimId === CUSTOM_TRIM_ID) readCustom();
  }

  function result(): BookResult {
    const problems: string[] = [];
    const custom = state.binding === 'paperback' && state.trimId === CUSTOM_TRIM_ID;
    const preset = custom ? undefined : getTrimSize(state.trimId, state.binding);
    const trimWidth = preset ? preset.width : state.customWidth;
    const trimHeight = preset ? preset.height : state.customHeight;
    if (custom && !readCustom()) problems.push('Enter a trim width and height greater than zero.');
    if (state.pages === null || state.pages <= 0) problems.push('Enter the number of pages in your book.');
    if (problems.length) return { layout: null, problems };
    return {
      layout: computeCoverLayout({
        binding: state.binding,
        trimWidth,
        trimHeight,
        pageCount: state.pages!,
        paper: state.paper,
        readingDirection: state.direction,
        safeMargin: state.safe === 'conservative' ? COVER_SAFE_MARGIN_CONSERVATIVE : COVER_SAFE_MARGIN,
        trimId: preset?.id,
      }),
      problems,
    };
  }

  /** Update the form chrome (hints, visibility, toggles) to match the state. */
  function syncChrome(): void {
    const custom = state.binding === 'paperback' && state.trimId === CUSTOM_TRIM_ID;
    el.customBox.hidden = !custom;
    el.safeField.hidden = state.binding === 'hardcover';
    const preset = custom ? undefined : getTrimSize(state.trimId, state.binding);
    el.trimNote.hidden = !preset?.note;
    el.trimNote.textContent = preset?.note ?? '';
    const paper = getPaper(state.paper);
    const limits = pageLimits(state.binding, preset, paper);
    el.pagesHint.textContent =
      limits.max === null
        ? 'This ink and paper combination is not available at this trim size.'
        : `${limits.min} to ${limits.max} pages for this ${state.binding === 'hardcover' ? 'binding' : 'trim size and paper'}.`;
    bindingSeg.sync();
  }

  /** Update everything that reflects the current state, then tell the screens. */
  function commit(): void {
    syncChrome();
    onChange();
  }

  const showMessages = (r: BookResult) => {
    const msgs = [...r.problems.map((text) => ({ level: 'error', text })), ...(r.layout?.warnings ?? []).map((w) => ({ level: w.level, text: w.message }))];
    el.messages.innerHTML = msgs.map((m) => `<div class="msg ${m.level}">${esc(m.text)}</div>`).join('');
  };

  const form = $('book-form');
  form.addEventListener('input', () => {
    read();
    commit();
  });
  form.addEventListener('change', (e) => {
    if (e.target === el.customUnit) {
      readCustom();
      state.unit = el.customUnit.value as AppState['unit'];
      writeCustom();
    }
    read();
    commit();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  populate();
  write();
  syncChrome();

  return {
    setUnit: (unit) => {
      if (state.trimId === CUSTOM_TRIM_ID) readCustom(); // capture values in the unit they were typed in
      state.unit = unit;
      writeCustom();
    },
    write: () => {
      populate();
      write();
      commit();
    },
    result: () => {
      read();
      const r = result();
      showMessages(r);
      return r;
    },
  };
}

