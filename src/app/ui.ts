import {
  COVER_SAFE_MARGIN,
  COVER_SAFE_MARGIN_CONSERVATIVE,
  CUSTOM_TRIM_ID,
  MIN_PAGES,
  PAPER_TYPES,
  TRIM_SIZES,
  buildCoverScene,
  computeCoverLayout,
  exportFileName,
  PT_PER_INCH,
  formatLength,
  formatRow,
  formatSize,
  getPaper,
  getTrimSize,
  inchesTo,
  maxPageCount,
  measurementRows,
  sceneToPdf,
  sceneToRaster,
  sceneToSvg,
  summaryText,
  toInches,
  toPixels,
  trimNumber,
  UNITS,
  type CoverLayout,
  type ExportFormat,
  type SceneMode,
  type Unit,
} from '../core';
import { copyText, isDesktop, saveFile } from './files';
import { loadState, saveState, type AppState, type Dpi, type SafeChoice } from './state';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** UI typography: show a multiplication sign instead of the ASCII x used in exports. */
const times = (s: string) => s.replace(/ x /g, ' × ');

const unitLabel: Record<Unit, string> = { in: 'in', cm: 'cm', mm: 'mm' };

export function initApp(): void {
  const state: AppState = loadState();
  let layout: CoverLayout | null = null;
  let toastTimer: number | undefined;

  const el = {
    trim: $<HTMLSelectElement>('trim'),
    trimNote: $('trim-note'),
    customBox: $('custom-trim'),
    customW: $<HTMLInputElement>('custom-w'),
    customH: $<HTMLInputElement>('custom-h'),
    customUnit: $('custom-unit'),
    paper: $('paper'),
    pages: $<HTMLInputElement>('pages'),
    pagesHint: $('pages-hint'),
    direction: $('direction'),
    safe: $<HTMLSelectElement>('safe'),
    dpi: $<HTMLSelectElement>('dpi'),
    messages: $('messages'),
    primary: $('canvas-primary'),
    alt: $('canvas-alt'),
    unitToggle: $('unit-toggle'),
    previewToggle: $('preview-toggle'),
    preview: $('preview'),
    empty: $('empty'),
    table: $('measurements').querySelector('tbody')!,
    guidesV: $('guides-v').querySelector('tbody')!,
    guidesH: $('guides-h').querySelector('tbody')!,
    exportHint: $('export-hint'),
    variantToggle: $('variant-toggle'),
    formatToggle: $('format-toggle'),
    formatHint: $('format-hint'),
    toast: $('toast'),
    buttons: {
      download: $<HTMLButtonElement>('download'),
      copy: $<HTMLButtonElement>('copy-summary'),
      txt: $<HTMLButtonElement>('dl-txt'),
      copyCanvas: $<HTMLButtonElement>('copy-canvas'),
    },
  };

  // ---- build static form content -------------------------------------------------------------

  el.trim.innerHTML =
    TRIM_SIZES.map((t) => `<option value="${t.id}">${esc(`${formatSize(t.width, t.height, 'in')} (${formatSize(t.width, t.height, 'cm')})`)}</option>`).join('') +
    `<option value="${CUSTOM_TRIM_ID}">Custom size&hellip;</option>`;

  const radio = (name: string, value: string, label: string, small = '') =>
    `<label class="radio"><input type="radio" name="${name}" value="${value}" /> <span>${esc(label)}</span>${small ? `<small>${esc(small)}</small>` : ''}</label>`;

  el.paper.innerHTML = PAPER_TYPES.map((p) => radio('paper', p.id, p.label, `${p.thickness}" / page`)).join('');
  el.direction.innerHTML =
    radio('direction', 'ltr', 'Left to right', 'back | spine | front') + radio('direction', 'rtl', 'Right to left', 'front | spine | back');
  el.safe.innerHTML =
    `<option value="standard">KDP standard: ${COVER_SAFE_MARGIN}" from the edge</option>` +
    `<option value="conservative">Extra cautious: ${COVER_SAFE_MARGIN_CONSERVATIVE}" from the edge</option>`;
  el.dpi.innerHTML = `<option value="300">300 DPI (print quality)</option><option value="150">150 DPI (smaller files)</option>`;

  const segment = <T extends string>(host: HTMLElement, items: { value: T; label: string }[], get: () => T, set: (v: T) => void) => {
    host.innerHTML = items.map((i) => `<button type="button" data-v="${i.value}">${esc(i.label)}</button>`).join('');
    host.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) set(b.dataset.v as T);
    });
    return () => host.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
  };

  const syncUnitToggle = segment(el.unitToggle, UNITS.map((u) => ({ value: u, label: unitLabel[u] })), () => state.unit, (u) => {
    readCustomInputs();
    state.unit = u;
    writeCustomInputs();
    update();
  });
  const variants: { value: SceneMode; label: string }[] = [
    { value: 'template', label: 'Template' },
    { value: 'overlay', label: 'Guides overlay' },
  ];
  const setVariant = (m: SceneMode) => {
    state.variant = m;
    if (m === 'overlay' && state.format === 'jpg') state.format = 'png'; // JPG cannot be transparent
    update();
  };
  const syncPreviewToggle = segment<SceneMode>(el.previewToggle, variants, () => state.variant, setVariant);
  const syncVariantToggle = segment<SceneMode>(el.variantToggle, variants, () => state.variant, setVariant);
  const syncFormatToggle = segment<ExportFormat>(
    el.formatToggle,
    [
      { value: 'png', label: 'PNG' },
      { value: 'jpg', label: 'JPG' },
      { value: 'pdf', label: 'PDF' },
    ],
    () => state.format,
    (f) => {
      state.format = f;
      update();
    },
  );

  // ---- state <-> form ------------------------------------------------------------------------

  function writeForm(): void {
    el.trim.value = state.trimId;
    el.pages.value = state.pages === null ? '' : String(state.pages);
    el.safe.value = state.safe;
    el.dpi.value = String(state.dpi);
    for (const r of el.paper.querySelectorAll<HTMLInputElement>('input')) r.checked = r.value === state.paper;
    for (const r of el.direction.querySelectorAll<HTMLInputElement>('input')) r.checked = r.value === state.direction;
    writeCustomInputs();
  }

  function writeCustomInputs(): void {
    el.customW.value = trimNumber(inchesTo(state.unit, state.customWidth), 4);
    el.customH.value = trimNumber(inchesTo(state.unit, state.customHeight), 4);
    el.customUnit.textContent = unitLabel[state.unit];
  }

  /** Custom size is parsed in the unit currently shown. Invalid input keeps the last good value. */
  function readCustomInputs(): { w: number; h: number; ok: boolean } {
    const w = el.customW.valueAsNumber;
    const h = el.customH.valueAsNumber;
    const ok = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
    if (ok) {
      state.customWidth = toInches(state.unit, w);
      state.customHeight = toInches(state.unit, h);
    }
    el.customW.setAttribute('aria-invalid', String(!(Number.isFinite(w) && w > 0)));
    el.customH.setAttribute('aria-invalid', String(!(Number.isFinite(h) && h > 0)));
    return { w, h, ok };
  }

  function readForm(): void {
    state.trimId = el.trim.value;
    const pages = el.pages.valueAsNumber;
    state.pages = Number.isFinite(pages) ? pages : null;
    const paper = el.paper.querySelector<HTMLInputElement>('input:checked');
    if (paper) state.paper = paper.value as AppState['paper'];
    const dir = el.direction.querySelector<HTMLInputElement>('input:checked');
    if (dir) state.direction = dir.value as AppState['direction'];
    state.safe = el.safe.value as SafeChoice;
    state.dpi = Number(el.dpi.value) as Dpi;
    if (state.trimId === CUSTOM_TRIM_ID) readCustomInputs();
  }

  // ---- derive + render ----------------------------------------------------------------------

  function currentLayout(): { layout: CoverLayout | null; problems: string[] } {
    const problems: string[] = [];
    const preset = state.trimId === CUSTOM_TRIM_ID ? undefined : getTrimSize(state.trimId);
    const trimWidth = preset ? preset.width : state.customWidth;
    const trimHeight = preset ? preset.height : state.customHeight;
    if (state.trimId === CUSTOM_TRIM_ID && !readCustomInputs().ok) problems.push('Enter a trim width and height greater than zero.');
    if (state.pages === null || state.pages <= 0) problems.push('Enter the number of pages in your book.');
    if (problems.length) return { layout: null, problems };
    return {
      layout: computeCoverLayout({
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

  function update(): void {
    readForm();
    saveState(state);
    const result = currentLayout();
    layout = result.layout;

    // Form chrome
    el.customBox.hidden = state.trimId !== CUSTOM_TRIM_ID;
    const preset = getTrimSize(state.trimId);
    el.trimNote.hidden = !preset?.note;
    el.trimNote.textContent = preset?.note ?? '';
    const paper = getPaper(state.paper);
    const max = maxPageCount(preset, paper);
    el.pagesHint.textContent =
      max === null ? 'This ink and paper combination is not available at this trim size.' : `${MIN_PAGES} to ${max} pages for this trim size and paper.`;
    syncUnitToggle();
    syncPreviewToggle();
    syncVariantToggle();
    syncFormatToggle();
    el.formatToggle.querySelector<HTMLButtonElement>('[data-v="jpg"]')!.disabled = state.variant === 'overlay';
    el.formatToggle.querySelector('[data-v="jpg"]')!.setAttribute('title', state.variant === 'overlay' ? 'JPG cannot be transparent' : '');

    // Messages
    const msgs: { level: string; text: string }[] = [
      ...result.problems.map((text) => ({ level: 'error', text })),
      ...(layout?.warnings ?? []).map((w) => ({ level: w.level, text: w.message })),
    ];
    el.messages.innerHTML = msgs.map((m) => `<div class="msg ${m.level}">${esc(m.text)}</div>`).join('');

    // Exports
    const canExport = !!layout?.valid;
    for (const b of Object.values(el.buttons)) b.disabled = !canExport;
    el.buttons.download.textContent = `Download ${state.variant === 'overlay' ? 'guides overlay' : 'template'} (${state.format.toUpperCase()})`;
    el.formatHint.textContent = layout ? formatHint(layout) : '';
    el.exportHint.textContent = canExport
      ? isDesktop()
        ? 'Each download opens a Save As dialog.'
        : 'Files go to your browser’s download folder.'
      : 'Fix the issue above to enable downloads.';

    el.empty.hidden = !!layout;
    document.querySelector('.preview-wrap')!.toggleAttribute('hidden', !layout);
    if (!layout) {
      el.primary.textContent = '–';
      el.alt.textContent = '';
      el.table.innerHTML = el.guidesV.innerHTML = el.guidesH.innerHTML = '';
      return;
    }
    renderResults(layout);
  }

  function renderResults(l: CoverLayout): void {
    const { unit, dpi } = state;
    el.primary.textContent = times(formatSize(l.canvas.w, l.canvas.h, unit));
    const others = UNITS.filter((u) => u !== unit).map((u) => times(formatSize(l.canvas.w, l.canvas.h, u)));
    el.alt.textContent = `${others.join('  ·  ')}  ·  ${toPixels(l.canvas.w, dpi)} × ${toPixels(l.canvas.h, dpi)} px at ${dpi} DPI`;

    const scene = buildCoverScene(l, { mode: state.variant, dpi });
    el.preview.innerHTML = sceneToSvg(scene, { sized: false });
    el.preview.classList.toggle('checker', state.variant === 'overlay');

    el.table.innerHTML = measurementRows(l)
      .map((r) => `<tr><td>${esc(r.label)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}</td><td class="num">${esc(times(formatRow(r, unit)))}</td></tr>`)
      .join('');
    const guideRow = (g: { at: number; label: string }) => `<tr><td class="num">${esc(formatLength(g.at, unit))}</td><td>${esc(g.label)}</td></tr>`;
    el.guidesV.innerHTML = l.guides.vertical.map(guideRow).join('');
    el.guidesH.innerHTML = l.guides.horizontal.map(guideRow).join('');
  }

  // ---- actions -----------------------------------------------------------------------------

  function toast(message: string): void {
    el.toast.textContent = message;
    el.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (el.toast.hidden = true), 4500);
  }

  async function run(label: string, job: () => Promise<{ saved: boolean; path?: string }>): Promise<void> {
    if (!layout?.valid) return;
    try {
      const r = await job();
      if (r.saved) toast(r.path ? `Saved ${r.path}` : `${label} downloaded`);
    } catch (err) {
      console.error(err);
      toast(`Could not create the ${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const formatHint = (l: CoverLayout): string => {
    const { w, h } = l.canvas;
    const wPx = toPixels(w, state.dpi);
    const hPx = toPixels(h, state.dpi);
    // Whole pixels cannot hit the exact size, so state what the file really measures.
    const actual = `${trimNumber(wPx / state.dpi, 2)}" × ${trimNumber(hPx / state.dpi, 2)}"`;
    const tagged = `${wPx} × ${hPx} px, tagged ${state.dpi} DPI, so it opens at ${actual}`;
    switch (state.format) {
      case 'png':
        return `${tagged}. Lossless; keeps transparency for the overlay.`;
      case 'jpg':
        return `${tagged}. Smaller file; no transparency.`;
      case 'pdf':
        return `One vector page, exactly ${times(formatSize(w, h, 'in'))} (${Math.round(w * PT_PER_INCH)} × ${Math.round(h * PT_PER_INCH)} pt). Print at 100% to check with a ruler.`;
    }
  };

  el.buttons.download.addEventListener('click', () =>
    run(`${state.variant === 'overlay' ? 'guides overlay' : 'template'} ${state.format.toUpperCase()}`, async () => {
      const l = layout!;
      const scene = buildCoverScene(l, { mode: state.variant, dpi: state.dpi });
      const name = exportFileName(l, state.variant, state.format);
      if (state.format === 'pdf') {
        const bytes = await sceneToPdf(scene, { title: `KDP cover template ${formatSize(l.canvas.w, l.canvas.h, 'in')}` });
        return saveFile(name, bytes, 'application/pdf');
      }
      const img = await sceneToRaster(scene, state.dpi, state.format);
      return saveFile(name, img.bytes, img.mime);
    }),
  );
  el.buttons.txt.addEventListener('click', () =>
    run('measurements file', async () => {
      const l = layout!;
      return saveFile(exportFileName(l, 'template', 'txt').replace('kdp-cover-template', 'kdp-cover-measurements'), summaryText(l, state.unit, state.dpi), 'text/plain');
    }),
  );
  el.buttons.copy.addEventListener('click', async () => {
    if (!layout) return;
    toast((await copyText(summaryText(layout, state.unit, state.dpi))) ? 'Measurements copied' : 'Could not copy to the clipboard');
  });
  el.buttons.copyCanvas.addEventListener('click', async () => {
    if (!layout) return;
    const { canvas } = layout;
    const text = `${formatSize(canvas.w, canvas.h, state.unit)} (${toPixels(canvas.w, state.dpi)} x ${toPixels(canvas.h, state.dpi)} px at ${state.dpi} DPI)`;
    toast((await copyText(text)) ? `Copied ${text}` : 'Could not copy to the clipboard');
  });

  $('book-form').addEventListener('input', update);
  $('book-form').addEventListener('change', update);
  $('book-form').addEventListener('submit', (e) => e.preventDefault());

  writeForm();
  update();
}
