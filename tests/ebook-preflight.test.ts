import { describe, expect, it } from 'vitest';
import { EBOOK, computeEbookLayout, ebookFileName, ebookRows } from '../src/core/ebook';
import { buildEbookScene } from '../src/core/ebookScene';
import { computeCoverLayout, type CoverInput } from '../src/core/cover';
import { detectKind, diagnoseSize, readDeclaredDpi, readFileFacts, runPreflight, type FileFacts } from '../src/core/preflight';
import { readJpegDpi, readPngDpi, setJpegDpi, setPngDpi } from '../src/core/render/raster-meta';
import { sceneToPdf } from '../src/core/render/pdf';
import { buildCoverScene } from '../src/core/scene';
import { sceneToSvg } from '../src/core/render/svg';

describe('eBook cover', () => {
  it('accepts KDP’s ideal size with no warnings', () => {
    const l = computeEbookLayout({ widthPx: 1600, heightPx: 2560 });
    expect(l.valid).toBe(true);
    expect(l.warnings).toEqual([]);
    expect(l.ratio).toBe(1.6);
    expect(l.width * EBOOK.dpi).toBeCloseTo(1600, 6);
    expect(l.height * EBOOK.dpi).toBeCloseTo(2560, 6);
  });

  it('flags sizes below ideal, below minimum, wrong ratio, too small and too big', () => {
    const codes = (w: number, h: number) => computeEbookLayout({ widthPx: w, heightPx: h }).warnings.map((x) => x.code);
    expect(codes(1563, 2500)).toContain('below-ideal');
    expect(codes(500, 800)).toContain('below-minimum');
    expect(codes(1000, 1000)).toContain('ratio');
    expect(codes(300, 400)).toContain('too-small');
    expect(computeEbookLayout({ widthPx: 300, heightPx: 400 }).valid).toBe(false);
    expect(codes(10_001, 16_001)).toContain('too-large');
    expect(computeEbookLayout({ widthPx: 1600.5, heightPx: 2560 }).valid).toBe(false);
  });

  it('draws a template whose size is exactly the pixel size at 300 DPI', () => {
    const l = computeEbookLayout({ widthPx: 1600, heightPx: 2560 });
    const scene = buildEbookScene(l, { mode: 'template', dpi: 300 });
    expect(Math.round(scene.width * 300)).toBe(1600);
    expect(Math.round(scene.height * 300)).toBe(2560);
    const texts = scene.items.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    expect(texts).toContain('1600 x 2560 px');
    expect(buildEbookScene(l, { mode: 'overlay', dpi: 300 }).items.some((p) => p.kind === 'text')).toBe(false);
    // everything inside the canvas
    for (const p of scene.items) {
      if (p.kind === 'rect') {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x + p.w).toBeLessThanOrEqual(scene.width + 1e-9);
      }
    }
  });

  it('names files and lists the KDP rules', () => {
    const l = computeEbookLayout({ widthPx: 1600, heightPx: 2560 });
    expect(ebookFileName(l, 'template', 'jpg')).toBe('kdp-ebook-cover-template_1600x2560px.jpg');
    expect(ebookRows(l).map((r) => r.id)).toEqual(expect.arrayContaining(['size', 'ratio', 'file', 'exclude']));
  });
});

describe('DPI readers', () => {
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  );
  it('round-trips PNG and JPEG DPI', () => {
    expect(readPngDpi(png)).toBeNull();
    expect(readPngDpi(setPngDpi(png, 300))).toBeCloseTo(300, 0);
    expect(readPngDpi(setPngDpi(png, 72))).toBeCloseTo(72, 0);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 2, 0xff, 0xd9]);
    expect(readJpegDpi(jpeg)).toBeNull();
    expect(readJpegDpi(setJpegDpi(jpeg, 300))).toBe(300);
  });

  it('detects file kinds', () => {
    expect(detectKind(png)).toBe('png');
    expect(detectKind(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectKind(new TextEncoder().encode('%PDF-1.7'))).toBe('pdf');
    expect(detectKind(new TextEncoder().encode('hello'))).toBe('other');
    expect(readDeclaredDpi('png', setPngDpi(png, 150))).toBeCloseTo(150, 0);
  });
});

describe('preflight', () => {
  const book: CoverInput = { trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 200, paper: 'bw-white', readingDirection: 'ltr' };
  const layout = computeCoverLayout(book);
  const pdfFacts = (w: number, h: number, pages = 1, bytes = 1_000_000): FileFacts => ({
    name: 'cover.pdf',
    bytes,
    kind: 'pdf',
    pdf: { pages, widthIn: w, heightIn: h, cropBoxDiffers: false },
  });
  const status = (r: ReturnType<typeof runPreflight>, id: string) => r.checks.find((c) => c.id === id)?.status;

  it('passes a PDF at exactly the right size', async () => {
    const bytes = await sceneToPdf(buildCoverScene(layout, { mode: 'template', dpi: 300 }));
    const facts = await readFileFacts('cover.pdf', bytes);
    expect(facts.kind).toBe('pdf');
    expect(facts.pdf!.pages).toBe(1);
    expect(facts.pdf!.widthIn).toBeCloseTo(layout.canvas.w, 3);
    const r = runPreflight(layout, facts);
    expect(r.verdict).toBe('pass');
    expect(status(r, 'size')).toBe('pass');
    expect(r.notChecked.length).toBeGreaterThan(0);
  });

  it('warns when slightly off and fails when clearly wrong', () => {
    expect(status(runPreflight(layout, pdfFacts(layout.canvas.w + 0.02, layout.canvas.h)), 'size')).toBe('warn');
    expect(runPreflight(layout, pdfFacts(layout.canvas.w + 0.02, layout.canvas.h)).verdict).toBe('warn');
    const bad = runPreflight(layout, pdfFacts(layout.canvas.w + 0.5, layout.canvas.h));
    expect(status(bad, 'size')).toBe('fail');
    expect(bad.verdict).toBe('fail');
  });

  it('fails multi-page PDFs', () => {
    const r = runPreflight(layout, pdfFacts(layout.canvas.w, layout.canvas.h, 3));
    expect(status(r, 'pages')).toBe('fail');
  });

  it('diagnoses common mistakes', () => {
    const c = layout.canvas;
    expect(diagnoseSize(layout, c.h, c.w)).toMatch(/rotated/i);
    expect(diagnoseSize(layout, c.w - 0.25, c.h - 0.25)).toMatch(/no bleed/i);
    expect(diagnoseSize(layout, 6.125, c.h)).toMatch(/front cover only/i);
    const hc = computeCoverLayout({ ...book, binding: 'hardcover' });
    expect(diagnoseSize(layout, hc.canvas.w, hc.canvas.h)).toMatch(/hardcover cover/i);
    expect(diagnoseSize(hc, layout.canvas.w, layout.canvas.h)).toMatch(/paperback cover/i);
    // right height, wrong width: infers the page count (240 pages)
    const other = computeCoverLayout({ ...book, pageCount: 240 });
    expect(diagnoseSize(layout, other.canvas.w, c.h)).toMatch(/about 240 pages/);
    expect(diagnoseSize(layout, 40, 40)).toBeNull();
  });

  it('checks images by proportion and effective resolution', () => {
    const px = (w: number, h: number, dpi: number | null = null): FileFacts => ({ name: 'c.png', bytes: 2_000_000, kind: 'png', raster: { widthPx: w, heightPx: h, dpi } });
    const good = runPreflight(layout, px(Math.round(layout.canvas.w * 300), Math.round(layout.canvas.h * 300), 300));
    expect(status(good, 'size')).toBe('pass');
    expect(status(good, 'resolution')).toBe('pass');
    expect(status(good, 'type')).toBe('warn'); // KDP wants a PDF
    expect(good.verdict).toBe('warn');

    const soft = runPreflight(layout, px(Math.round(layout.canvas.w * 200), Math.round(layout.canvas.h * 200)));
    expect(status(soft, 'size')).toBe('pass');
    expect(status(soft, 'resolution')).toBe('warn');
    const blurry = runPreflight(layout, px(Math.round(layout.canvas.w * 100), Math.round(layout.canvas.h * 100)));
    expect(status(blurry, 'resolution')).toBe('fail');

    const wrongShape = runPreflight(layout, px(3000, 3000));
    expect(status(wrongShape, 'size')).toBe('fail');
    expect(wrongShape.verdict).toBe('fail');
    expect(status(good, 'declared-dpi')).toBe('info');
  });

  it('judges file size: warn over 40 MB, fail over 650 MB (both bindings)', () => {
    const hc = computeCoverLayout({ ...book, binding: 'hardcover' });
    for (const l of [layout, hc]) {
      expect(status(runPreflight(l, pdfFacts(l.canvas.w, l.canvas.h, 1, 30 * 1024 * 1024)), 'filesize')).toBe('pass');
      expect(status(runPreflight(l, pdfFacts(l.canvas.w, l.canvas.h, 1, 100 * 1024 * 1024)), 'filesize')).toBe('warn');
      expect(status(runPreflight(l, pdfFacts(l.canvas.w, l.canvas.h, 1, 700 * 1024 * 1024)), 'filesize')).toBe('fail');
    }
  });

  it('rejects unknown file types', () => {
    const r = runPreflight(layout, { name: 'x.docx', bytes: 10, kind: 'other' });
    expect(r.verdict).toBe('fail');
  });

  it('passes a hardcover PDF at the exact hardcover size', async () => {
    const hc = computeCoverLayout({ ...book, binding: 'hardcover' });
    const facts = await readFileFacts('hc.pdf', await sceneToPdf(buildCoverScene(hc, { mode: 'template', dpi: 300 })));
    expect(runPreflight(hc, facts).verdict).toBe('pass');
  });
});

describe('hardcover scene', () => {
  const papers = ['bw-white', 'bw-cream', 'color-premium'] as const;
  it('keeps every shape inside the canvas for every hardcover trim, paper, page count and direction', async () => {
    const { HARDCOVER_TRIM_SIZES } = await import('../src/core/specs');
    for (const t of HARDCOVER_TRIM_SIZES) {
      for (const paper of papers) {
        for (const pageCount of [76, 120, 300, 550]) {
          for (const readingDirection of ['ltr', 'rtl'] as const) {
            for (const mode of ['template', 'overlay'] as const) {
              const layout = computeCoverLayout({ binding: 'hardcover', trimWidth: t.width, trimHeight: t.height, trimId: t.id, paper, pageCount, readingDirection });
              expect(layout.valid).toBe(true);
              const scene = buildCoverScene(layout, { mode, dpi: 300 });
              for (const p of scene.items) {
                const [x1, y1, x2, y2] =
                  p.kind === 'rect' ? [p.x, p.y, p.x + p.w, p.y + p.h] : p.kind === 'line' ? [Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2)] : [p.x, p.y, p.x, p.y];
                const where = `${t.id} ${paper} ${pageCount} ${readingDirection} ${mode}`;
                expect(x1, where).toBeGreaterThanOrEqual(-1e-6);
                expect(y1, where).toBeGreaterThanOrEqual(-1e-6);
                expect(x2, where).toBeLessThanOrEqual(scene.width + 1e-6);
                expect(y2, where).toBeLessThanOrEqual(scene.height + 1e-6);
              }
            }
          }
        }
      }
    }
  });

  it('labels the wrap, board and hinge and prints the canvas size', () => {
    const layout = computeCoverLayout({ binding: 'hardcover', trimWidth: 6, trimHeight: 9, trimId: '6x9', paper: 'bw-white', pageCount: 200, readingDirection: 'ltr' });
    const scene = buildCoverScene(layout, { mode: 'template', dpi: 300 });
    const texts = scene.items.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    expect(texts).toContain('HARDCOVER CANVAS SIZE');
    expect(texts).toContain('14.2142" x 10.4173"');
    expect(texts.some((t) => t.startsWith('Wrap 0.5906'))).toBe(true);
    expect(texts.some((t) => /Hinge: no text/.test(t))).toBe(true);
    expect(texts.some((t) => t.startsWith('board 6.1969'))).toBe(true);
    // teal hinge bands exist
    expect(scene.items.filter((p) => p.kind === 'rect' && p.fill === '#12A594' && p.fillOpacity === 0.22)).toHaveLength(2);
    expect(sceneToSvg(scene)).toContain('width="14.21418in"');
  });
});
