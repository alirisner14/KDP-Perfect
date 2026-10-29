import {
  EBOOK,
  EBOOK_PRESETS,
  buildEbookScene,
  computeEbookLayout,
  ebookFileName,
  ebookRows,
  ebookSummaryText,
  sceneToRaster,
  sceneToSvg,
  type EbookLayout,
  type SceneMode,
} from '../../core';
import type { Ctx, Screen } from '../context';
import { $, esc, segment, times, toast } from '../dom';
import { copyText, saveFile } from '../files';
import type { EbookPreset } from '../state';

export function initEbookScreen(ctx: Ctx): Screen {
  const e = ctx.state.ebook;
  const el = {
    preset: $<HTMLSelectElement>('ebook-preset'),
    custom: $('ebook-custom'),
    w: $<HTMLInputElement>('ebook-w'),
    h: $<HTMLInputElement>('ebook-h'),
    messages: $('ebook-messages'),
    primary: $('ebook-primary'),
    alt: $('ebook-alt'),
    ratio: $('ebook-ratio'),
    copySize: $<HTMLButtonElement>('ebook-copy-size'),
    previewWrap: $('ebook-preview-wrap'),
    preview: $('ebook-preview'),
    previewToggle: $('ebook-preview-toggle'),
    variantToggle: $('ebook-variant-toggle'),
    formatToggle: $('ebook-format-toggle'),
    formatHint: $('ebook-format-hint'),
    download: $<HTMLButtonElement>('ebook-download'),
    copy: $<HTMLButtonElement>('ebook-copy'),
    rules: $('ebook-rules').querySelector('tbody')!,
  };

  el.preset.innerHTML =
    EBOOK_PRESETS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('') + '<option value="custom">Custom size&hellip;</option>';
  el.preset.value = e.preset;
  el.w.value = String(e.width);
  el.h.value = String(e.height);

  const variants: { value: SceneMode; label: string }[] = [
    { value: 'template', label: 'Template' },
    { value: 'overlay', label: 'Guides overlay' },
  ];
  const setVariant = (v: SceneMode) => {
    e.variant = v;
    if (v === 'overlay' && e.format === 'jpg') e.format = 'png';
    ctx.save();
    refresh();
  };
  const previewSeg = segment<SceneMode>(el.previewToggle, variants, () => e.variant, setVariant);
  const variantSeg = segment<SceneMode>(el.variantToggle, variants, () => e.variant, setVariant);
  const formatSeg = segment<'png' | 'jpg'>(
    el.formatToggle,
    [
      { value: 'jpg', label: 'JPG' },
      { value: 'png', label: 'PNG' },
    ],
    () => e.format,
    (f) => {
      e.format = f;
      ctx.save();
      refresh();
    },
  );

  function current(): EbookLayout {
    return computeEbookLayout({ widthPx: e.width, heightPx: e.height });
  }

  el.preset.addEventListener('change', () => {
    e.preset = el.preset.value as EbookPreset;
    const p = EBOOK_PRESETS.find((x) => x.id === e.preset);
    if (p) {
      e.width = p.widthPx;
      e.height = p.heightPx;
      el.w.value = String(e.width);
      el.h.value = String(e.height);
    }
    ctx.save();
    refresh();
  });
  const readSize = () => {
    const w = el.w.valueAsNumber;
    const h = el.h.valueAsNumber;
    if (Number.isFinite(w)) e.width = Math.round(w);
    if (Number.isFinite(h)) e.height = Math.round(h);
    ctx.save();
    refresh();
  };
  el.w.addEventListener('input', readSize);
  el.h.addEventListener('input', readSize);

  function refresh(): void {
    const l = current();
    previewSeg.sync();
    variantSeg.sync();
    formatSeg.sync();
    formatSeg.disable('jpg', e.variant === 'overlay', 'JPG cannot be transparent');
    el.custom.hidden = e.preset !== 'custom';

    el.messages.innerHTML = l.warnings.map((w) => `<div class="msg ${w.level}">${esc(w.message)}</div>`).join('');
    el.download.disabled = el.copy.disabled = el.copySize.disabled = !l.valid;
    el.previewWrap.hidden = !l.valid;
    if (!l.valid) {
      el.primary.textContent = '–';
      el.alt.textContent = '';
      el.ratio.textContent = '';
      el.rules.innerHTML = '';
      return;
    }

    el.primary.textContent = times(`${l.widthPx} x ${l.heightPx} px`);
    el.alt.textContent = `${EBOOK.dpi} DPI, RGB, JPEG preferred, under 50 MB`;
    el.ratio.textContent = `Height / width ${l.ratio}:1`;

    const scene = buildEbookScene(l, { mode: e.variant, dpi: EBOOK.dpi });
    el.preview.innerHTML = sceneToSvg(scene, { sized: false });
    el.preview.classList.toggle('checker', e.variant === 'overlay');
    // Keep the preview at the cover's true proportions without growing past the viewport.
    el.preview.style.setProperty('--ar', String(l.widthPx / l.heightPx));

    el.download.textContent = `Download ${e.variant === 'overlay' ? 'guides overlay' : 'template'} (${e.format.toUpperCase()})`;
    el.formatHint.textContent = `${l.widthPx} × ${l.heightPx} px, exactly. ${e.format === 'jpg' ? 'JPEG is KDP’s preferred format.' : 'PNG keeps transparency for the overlay.'}`;
    el.rules.innerHTML = ebookRows(l)
      .map((r) => `<tr><td>${esc(r.label)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}</td><td>${esc(r.value)}</td></tr>`)
      .join('');
  }

  async function download(): Promise<void> {
    const l = current();
    if (!l.valid) return;
    try {
      const scene = buildEbookScene(l, { mode: e.variant, dpi: EBOOK.dpi });
      const img = await sceneToRaster(scene, EBOOK.dpi, e.format);
      const r = await saveFile(ebookFileName(l, e.variant, e.format), img.bytes, img.mime);
      if (r.saved) toast(r.path ? `Saved ${r.path}` : 'eBook cover template downloaded');
    } catch (err) {
      console.error(err);
      toast(`Could not create the file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  el.download.addEventListener('click', download);
  el.copy.addEventListener('click', async () => {
    toast((await copyText(ebookSummaryText(current()))) ? 'Requirements copied' : 'Could not copy to the clipboard');
  });
  el.copySize.addEventListener('click', async () => {
    const l = current();
    const text = `${l.widthPx} x ${l.heightPx} px`;
    toast((await copyText(text)) ? `Copied ${text}` : 'Could not copy to the clipboard');
  });

  return { id: 'ebook', refresh };
}
