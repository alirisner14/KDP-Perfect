import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { computeCoverLayout, type CoverInput } from '../src/core/cover';
import { sceneToPdf } from '../src/core/render/pdf';
import { sceneToSvg } from '../src/core/render/svg';
import { buildCoverScene, type Primitive } from '../src/core/scene';
import { TRIM_SIZES, type PaperId } from '../src/core/specs';
import { exportFileName, measurementRows, summaryText } from '../src/core/summary';

const input = (over: Partial<CoverInput> = {}): CoverInput => ({
  trimWidth: 6,
  trimHeight: 9,
  pageCount: 333,
  paper: 'bw-cream',
  readingDirection: 'ltr',
  trimId: '6x9',
  ...over,
});

function extent(p: Primitive): [number, number, number, number] {
  switch (p.kind) {
    case 'rect':
      return [p.x, p.y, p.x + p.w, p.y + p.h];
    case 'line':
      return [Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2)];
    case 'text':
      return [p.x, p.y, p.x, p.y];
  }
}

describe('scene', () => {
  const papers: PaperId[] = ['bw-white', 'bw-cream', 'color-premium'];

  it('keeps every shape inside the canvas for every preset size, paper and direction', () => {
    for (const t of TRIM_SIZES) {
      for (const paper of papers) {
        for (const pageCount of [24, 79, 150, 333]) {
          for (const readingDirection of ['ltr', 'rtl'] as const) {
            for (const mode of ['template', 'overlay'] as const) {
              const layout = computeCoverLayout(input({ trimWidth: t.width, trimHeight: t.height, trimId: t.id, paper, pageCount, readingDirection }));
              const scene = buildCoverScene(layout, { mode, dpi: 300 });
              for (const p of scene.items) {
                const [x1, y1, x2, y2] = extent(p);
                const where = `${t.id} ${paper} ${pageCount}pp ${readingDirection} ${mode}`;
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

  it('template mode prints the canvas size and pixel dimensions on the artwork', () => {
    const layout = computeCoverLayout(input());
    const texts = buildCoverScene(layout, { mode: 'template', dpi: 300 })
      .items.filter((p): p is Extract<Primitive, { kind: 'text' }> => p.kind === 'text')
      .map((p) => p.text);
    expect(texts).toContain('13.0825" x 9.25"');
    expect(texts).toContain('3925 x 2775 px at 300 DPI');
    expect(texts).toContain('FRONT COVER');
    expect(texts).toContain('BACK COVER');
    expect(texts.some((t) => t.startsWith('SPINE TEXT ZONE'))).toBe(true);
    expect(texts).toContain('BARCODE AREA');
  });

  it('marks books under 79 pages as having no spine text', () => {
    const layout = computeCoverLayout(input({ pageCount: 60 }));
    const texts = buildCoverScene(layout, { mode: 'template', dpi: 300 })
      .items.filter((p): p is Extract<Primitive, { kind: 'text' }> => p.kind === 'text')
      .map((p) => p.text);
    expect(texts.some((t) => t.startsWith('NO SPINE TEXT'))).toBe(true);
    expect(texts.some((t) => t.startsWith('SPINE TEXT ZONE'))).toBe(false);
  });

  it('overlay mode is transparent and carries no text', () => {
    const scene = buildCoverScene(computeCoverLayout(input()), { mode: 'overlay', dpi: 300 });
    expect(scene.background).toBeNull();
    expect(scene.items.some((p) => p.kind === 'text')).toBe(false);
  });

  it('never lets the dimension block run into the barcode box', () => {
    for (const t of TRIM_SIZES) {
      const layout = computeCoverLayout(input({ trimWidth: t.width, trimHeight: t.height, trimId: t.id }));
      const scene = buildCoverScene(layout, { mode: 'template', dpi: 300 });
      const backBox = layout.safe.back;
      for (const p of scene.items) {
        if (p.kind !== 'text' || p.rotate) continue;
        const inBack = p.x > backBox.x && p.x < backBox.x + backBox.w;
        const isBarcodeCaption = p.text.includes('BARCODE') || p.text.includes('keep clear');
        if (inBack && !isBarcodeCaption) expect(p.y, `${t.id}: "${p.text}"`).toBeLessThan(layout.barcode.y);
      }
    }
  });
});

describe('SVG export', () => {
  it('produces a physically sized, well-formed document', () => {
    const layout = computeCoverLayout(input());
    const svg = sceneToSvg(buildCoverScene(layout, { mode: 'template', dpi: 300 }), { title: 'A & B <test>' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="13.0825in" height="9.25in"');
    expect(svg).toContain('viewBox="0 0 13.0825 9.25"');
    expect(svg).toContain('<title>A &amp; B &lt;test&gt;</title>');
    expect(svg.endsWith('</svg>')).toBe(true);
    // every opened tag is self-closed or closed: rough well-formedness check
    expect((svg.match(/<text /g) ?? []).length).toBe((svg.match(/<\/text>/g) ?? []).length);
  });

  it('can omit the physical size for on-screen previews', () => {
    const svg = sceneToSvg(buildCoverScene(computeCoverLayout(input()), { mode: 'template', dpi: 300 }), { sized: false });
    expect(svg).not.toContain('in" height=');
  });
});

describe('PDF export', () => {
  it('has a single page exactly the size of the cover canvas', async () => {
    const layout = computeCoverLayout(input());
    const bytes = await sceneToPdf(buildCoverScene(layout, { mode: 'template', dpi: 300 }), { title: 'test' });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(13.0825 * 72, 2);
    expect(height).toBeCloseTo(9.25 * 72, 2);
  });

  it('renders the overlay variant too', async () => {
    const layout = computeCoverLayout(input({ readingDirection: 'rtl' }));
    const bytes = await sceneToPdf(buildCoverScene(layout, { mode: 'overlay', dpi: 300 }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe('summary', () => {
  const layout = computeCoverLayout(input());

  it('lists the canvas first and covers every zone', () => {
    const rows = measurementRows(layout);
    expect(rows[0]!.id).toBe('canvas');
    expect(rows.map((r) => r.id)).toEqual(
      expect.arrayContaining(['bleed', 'trim', 'spine', 'spine-text', 'safe-overall', 'safe-back', 'safe-front', 'barcode']),
    );
  });

  it('writes a copyable text summary in the chosen unit', () => {
    const inches = summaryText(layout, 'in', 300);
    expect(inches).toContain('13.0825" x 9.25"');
    expect(inches).toContain('3925 x 2775 px at 300 DPI');
    expect(inches).toContain('Spine fold (left)');
    expect(summaryText(layout, 'mm', 300)).toContain('mm');
  });

  it('builds descriptive file names', () => {
    expect(exportFileName(layout, 'template', 'png')).toBe('kdp-cover-template_6x9in_333pp_cream.png');
    expect(exportFileName(layout, 'overlay', 'png')).toBe('kdp-cover-guides-overlay_6x9in_333pp_cream.png');
    const custom = computeCoverLayout(input({ trimWidth: 5.5, trimHeight: 8.25, paper: 'color-premium', pageCount: 120, trimId: undefined }));
    expect(exportFileName(custom, 'template', 'pdf')).toBe('kdp-cover-template_5.5x8.25in_120pp_color-premium.pdf');
  });
});
