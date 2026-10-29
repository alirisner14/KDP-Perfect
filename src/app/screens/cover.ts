import {
  PT_PER_INCH,
  buildCoverScene,
  exportFileName,
  formatLength,
  formatRow,
  formatSize,
  measurementRows,
  sceneToPdf,
  sceneToRaster,
  sceneToSvg,
  summaryText,
  toPixels,
  trimNumber,
  UNITS,
  type CoverLayout,
  type ExportFormat,
  type SceneMode,
  type Unit,
} from '../../core';
import type { Ctx, Screen } from '../context';
import { $, esc, segment, times, toast } from '../dom';
import { copyText, isDesktop, saveFile } from '../files';
import type { Dpi } from '../state';

export function initCoverScreen(ctx: Ctx): Screen {
  const { state } = ctx;
  const el = {
    eyebrow: $('canvas-eyebrow'),
    primary: $('canvas-primary'),
    alt: $('canvas-alt'),
    unitToggle: $('unit-toggle'),
    previewToggle: $('preview-toggle'),
    previewWrap: $('cover-preview-wrap'),
    preview: $('preview'),
    empty: $('empty'),
    exports: $('cover-exports'),
    variantToggle: $('variant-toggle'),
    formatToggle: $('format-toggle'),
    dpi: $<HTMLSelectElement>('dpi'),
    formatHint: $('format-hint'),
    exportHint: $('export-hint'),
    download: $<HTMLButtonElement>('download'),
    copySummary: $<HTMLButtonElement>('copy-summary'),
    saveTxt: $<HTMLButtonElement>('dl-txt'),
    copyCanvas: $<HTMLButtonElement>('copy-canvas'),
    table: $('measurements').querySelector('tbody')!,
    guidesV: $('guides-v').querySelector('tbody')!,
    guidesH: $('guides-h').querySelector('tbody')!,
    ringWord: $('ring-word'),
  };

  el.dpi.innerHTML = `<option value="300">300 DPI (print)</option><option value="150">150 DPI (small files)</option>`;
  el.dpi.addEventListener('change', () => {
    state.dpi = Number(el.dpi.value) as Dpi;
    ctx.save();
    refresh();
  });

  const variants: { value: SceneMode; label: string }[] = [
    { value: 'template', label: 'Template' },
    { value: 'overlay', label: 'Guides overlay' },
  ];
  const setVariant = (m: SceneMode) => {
    state.variant = m;
    if (m === 'overlay' && state.format === 'jpg') state.format = 'png'; // JPG cannot be transparent
    ctx.save();
    refresh();
  };
  const unitSeg = segment<Unit>(el.unitToggle, UNITS.map((u) => ({ value: u, label: u })), () => state.unit, (u) => ctx.setUnit(u));
  const previewSeg = segment<SceneMode>(el.previewToggle, variants, () => state.variant, setVariant);
  const variantSeg = segment<SceneMode>(el.variantToggle, variants, () => state.variant, setVariant);
  const formatSeg = segment<ExportFormat>(
    el.formatToggle,
    [
      { value: 'png', label: 'PNG' },
      { value: 'jpg', label: 'JPG' },
      { value: 'pdf', label: 'PDF' },
    ],
    () => state.format,
    (f) => {
      state.format = f;
      ctx.save();
      refresh();
    },
  );

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

  function refresh(): void {
    const layout = ctx.layout();
    const { unit, dpi } = state;
    unitSeg.sync();
    previewSeg.sync();
    variantSeg.sync();
    formatSeg.sync();
    formatSeg.disable('jpg', state.variant === 'overlay', 'JPG cannot be transparent');
    el.dpi.value = String(state.dpi);

    const canExport = !!layout?.valid;
    for (const b of [el.download, el.copySummary, el.saveTxt, el.copyCanvas]) b.disabled = !canExport;
    el.empty.hidden = !!layout;
    el.previewWrap.hidden = !layout;
    el.exports.hidden = !layout;
    if (!layout) {
      el.primary.textContent = '–';
      el.alt.textContent = '';
      el.table.innerHTML = el.guidesV.innerHTML = el.guidesH.innerHTML = '';
      return;
    }

    const hardcover = layout.binding === 'hardcover';
    el.eyebrow.textContent = hardcover ? 'Create your hardcover canvas at' : 'Create your design canvas at';
    el.ringWord.textContent = layout.ringName.toLowerCase();
    el.primary.textContent = times(formatSize(layout.canvas.w, layout.canvas.h, unit));
    const others = UNITS.filter((u) => u !== unit).map((u) => times(formatSize(layout.canvas.w, layout.canvas.h, u)));
    el.alt.textContent = `${others.join('  ·  ')}  ·  ${toPixels(layout.canvas.w, dpi)} × ${toPixels(layout.canvas.h, dpi)} px at ${dpi} DPI`;

    el.preview.innerHTML = sceneToSvg(buildCoverScene(layout, { mode: state.variant, dpi }), { sized: false });
    el.preview.classList.toggle('checker', state.variant === 'overlay');

    el.table.innerHTML = measurementRows(layout)
      .map((r) => `<tr><td>${esc(r.label)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}</td><td class="num">${esc(times(formatRow(r, unit)))}</td></tr>`)
      .join('');
    const guideRow = (g: { at: number; label: string }) => `<tr><td class="num">${esc(formatLength(g.at, unit))}</td><td>${esc(g.label)}</td></tr>`;
    el.guidesV.innerHTML = layout.guides.vertical.map(guideRow).join('');
    el.guidesH.innerHTML = layout.guides.horizontal.map(guideRow).join('');

    el.download.textContent = `Download ${state.variant === 'overlay' ? 'guides overlay' : 'template'} (${state.format.toUpperCase()})`;
    el.formatHint.textContent = formatHint(layout);
    el.exportHint.textContent = canExport
      ? isDesktop()
        ? 'Each download opens a Save As dialog.'
        : 'Files go to your browser’s download folder.'
      : 'Fix the issue on the left to enable downloads.';
  }

  async function run(label: string, job: () => Promise<{ saved: boolean; path?: string }>): Promise<void> {
    if (!ctx.layout()?.valid) return;
    try {
      const r = await job();
      if (r.saved) toast(r.path ? `Saved ${r.path}` : `${label} downloaded`);
    } catch (err) {
      console.error(err);
      toast(`Could not create the ${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  el.download.addEventListener('click', () =>
    run(`${state.variant === 'overlay' ? 'guides overlay' : 'template'} ${state.format.toUpperCase()}`, async () => {
      const l = ctx.layout()!;
      const scene = buildCoverScene(l, { mode: state.variant, dpi: state.dpi });
      const name = exportFileName(l, state.variant, state.format);
      if (state.format === 'pdf') {
        const bytes = await sceneToPdf(scene, { title: `KDP ${l.binding} cover template ${formatSize(l.canvas.w, l.canvas.h, 'in')}` });
        return saveFile(name, bytes, 'application/pdf');
      }
      const img = await sceneToRaster(scene, state.dpi, state.format);
      return saveFile(name, img.bytes, img.mime);
    }),
  );
  el.saveTxt.addEventListener('click', () =>
    run('measurements file', async () => {
      const l = ctx.layout()!;
      return saveFile(exportFileName(l, 'template', 'txt').replace(/kdp-(hardcover-)?cover-template/, 'kdp-$1cover-measurements'), summaryText(l, state.unit, state.dpi), 'text/plain');
    }),
  );
  el.copySummary.addEventListener('click', async () => {
    const l = ctx.layout();
    if (l) toast((await copyText(summaryText(l, state.unit, state.dpi))) ? 'Measurements copied' : 'Could not copy to the clipboard');
  });
  el.copyCanvas.addEventListener('click', async () => {
    const l = ctx.layout();
    if (!l) return;
    const text = `${formatSize(l.canvas.w, l.canvas.h, state.unit)} (${toPixels(l.canvas.w, state.dpi)} x ${toPixels(l.canvas.h, state.dpi)} px at ${state.dpi} DPI)`;
    toast((await copyText(text)) ? `Copied ${text}` : 'Could not copy to the clipboard');
  });

  return { id: 'cover', refresh };
}
