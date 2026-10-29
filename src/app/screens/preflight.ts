import { buildCoverScene, drawScene, formatSize, getPaper, runPreflight, type Check, type CoverLayout, type PreflightResult } from '../../core';
import { loadArtwork, newCanvas, type Artwork } from '../artwork';
import type { Ctx, Screen } from '../context';
import { $, bindFileInput, esc, segment, times, toast } from '../dom';
import { copyText } from '../files';

type Overlay = 'on' | 'off';

const ICON: Record<Check['status'], { glyph: string; label: string }> = {
  pass: { glyph: '✓', label: 'Pass' },
  warn: { glyph: '!', label: 'Warning' },
  fail: { glyph: '✕', label: 'Fail' },
  info: { glyph: 'i', label: 'Note' },
};

const VERDICT = {
  pass: 'Looks good. This cover matches the book you described.',
  warn: 'Mostly fine, but check the warnings before you upload.',
  fail: 'Needs fixing before you upload.',
} as const;

export function initPreflightScreen(ctx: Ctx): Screen {
  let art: Artwork | null = null;
  let overlay: Overlay = 'on';
  let loadError = '';

  const el = {
    expected: $('pf-expected'),
    book: $('pf-book'),
    drop: $('pf-drop'),
    file: $<HTMLInputElement>('pf-file'),
    result: $('pf-result'),
    verdict: $('pf-verdict'),
    checks: $('pf-checks'),
    notChecked: $('pf-notchecked'),
    copy: $<HTMLButtonElement>('pf-copy'),
    fileName: $('pf-file-name'),
    overlayToggle: $('pf-overlay-toggle'),
    preview: $('pf-preview'),
    caption: $('pf-caption'),
    empty: $('pf-empty'),
  };

  const overlaySeg = segment<Overlay>(
    el.overlayToggle,
    [
      { value: 'on', label: 'Guides on' },
      { value: 'off', label: 'Guides off' },
    ],
    () => overlay,
    (v) => {
      overlay = v;
      refresh();
    },
  );

  bindFileInput(el.file, el.drop, async (file) => {
    el.drop.classList.add('busy');
    loadError = '';
    try {
      art = await loadArtwork(file);
    } catch (err) {
      art = null;
      loadError = err instanceof Error ? err.message : String(err);
      toast(loadError);
    } finally {
      el.drop.classList.remove('busy');
    }
    refresh();
  });

  let last: PreflightResult | null = null;

  function reportText(layout: CoverLayout, r: PreflightResult): string {
    const lines = [
      'KDP PREFLIGHT REPORT',
      `File: ${art?.name ?? ''}`,
      `Checked against: ${layout.binding}, ${formatSize(layout.input.trimWidth, layout.input.trimHeight, 'in')}, ${layout.input.pageCount} pages, ${getPaper(layout.input.paper).label.toLowerCase()}`,
      `Expected size: ${formatSize(layout.canvas.w, layout.canvas.h, 'in')}`,
      '',
      `Result: ${VERDICT[r.verdict]}`,
      '',
    ];
    for (const c of r.checks) lines.push(`[${ICON[c.status].label.toUpperCase()}] ${c.title}: ${c.detail}`);
    lines.push('', 'Not checked:');
    for (const n of r.notChecked) lines.push(`  - ${n}`);
    return lines.join('\n') + '\n';
  }

  function drawPreview(layout: CoverLayout): void {
    if (!art) return;
    const width = Math.min(1600, Math.max(600, Math.round(el.preview.clientWidth * (window.devicePixelRatio || 1)) || 1200));
    const height = Math.round((width * layout.canvas.h) / layout.canvas.w);
    const canvas = newCanvas(width, height);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    const ctx2 = canvas.getContext('2d')!;
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(0, 0, width, height);
    ctx2.imageSmoothingQuality = 'high';
    ctx2.drawImage(art.canvas, 0, 0, width, height);
    if (overlay === 'on') drawScene(ctx2, buildCoverScene(layout, { mode: 'overlay', dpi: 300 }), width / layout.canvas.w);
    el.preview.replaceChildren(canvas);
  }

  function refresh(): void {
    const layout = ctx.layout();
    overlaySeg.sync();
    if (layout) {
      el.expected.textContent = times(formatSize(layout.canvas.w, layout.canvas.h, 'in'));
      el.book.textContent = `${layout.binding === 'hardcover' ? 'Hardcover' : 'Paperback'} · ${times(formatSize(layout.input.trimWidth, layout.input.trimHeight, 'in'))} · ${layout.input.pageCount} pages · ${getPaper(layout.input.paper).label.toLowerCase()}`;
    } else {
      el.expected.textContent = '–';
      el.book.textContent = '';
    }

    const show = !!layout && !!art;
    el.result.hidden = !show;
    el.drop.hidden = !layout;
    el.empty.hidden = !!layout;
    if (loadError && layout) {
      el.empty.hidden = false;
      el.empty.textContent = loadError;
    } else {
      el.empty.textContent = 'Enter your book details on the left, then choose your cover file.';
    }
    if (!show || !layout || !art) return;

    const r = runPreflight(layout, art.facts);
    last = r;
    el.verdict.className = `verdict ${r.verdict}`;
    el.verdict.textContent = VERDICT[r.verdict];
    el.checks.innerHTML = r.checks
      .map(
        (c) =>
          `<li class="check-row ${c.status}"><span class="ck" role="img" aria-label="${ICON[c.status].label}">${ICON[c.status].glyph}</span><div><strong>${esc(c.title)}</strong><span>${esc(times(c.detail))}</span></div></li>`,
      )
      .join('');
    el.notChecked.innerHTML = r.notChecked.map((n) => `<li>${esc(n)}</li>`).join('');
    el.fileName.textContent = art.name;
    el.caption.textContent =
      art.kind === 'pdf' && art.facts.pdf && Math.abs(art.facts.pdf.widthIn - layout.canvas.w) > 0.05
        ? 'Your artwork is stretched to the expected cover size here, so its guides may look off because the file is a different size.'
        : 'Your artwork with the KDP guides on top. Keep text and key art inside the green areas.';
    drawPreview(layout);
  }

  el.copy.addEventListener('click', async () => {
    const layout = ctx.layout();
    if (!layout || !last) return;
    toast((await copyText(reportText(layout, last))) ? 'Report copied' : 'Could not copy to the clipboard');
  });

  return { id: 'preflight', refresh, activate: () => art && refresh() };
}
