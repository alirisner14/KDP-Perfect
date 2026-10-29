# Roadmap

## Shipped

- **v0.1:** paperback cover template generator (PNG, JPG, PDF at actual size; desktop and web).
- **Unreleased:** hardcover (case laminate) templates, Kindle eBook cover template, Preflight check, 3D book mockup (including 1:1 output).

## Next: Word document → KDP interior (planned)

> **Goal:** the user uploads a `.docx`, picks a trim size, and gets a print-ready interior that meets KDP's requirements, with a customizable opening page for each chapter. The final page count feeds straight into the cover generator.

### What KDP requires (from *Build Your Book: Format a Paperback Manuscript*)

| Area | Requirement |
| --- | --- |
| Page size | Trim size, or trim + 0.125" width and + 0.25" height with bleed |
| Margins | Mirrored. Inside (gutter) grows with page count (0.375" to 0.875"); outside/top/bottom ≥ 0.25" (0.375" with bleed). Already implemented in `src/core/interior.ts` |
| Chapters | Each chapter starts on a new page; Heading 1 marks chapter titles (and TOC entries) |
| Front matter | Half title, title page, copyright, dedication, TOC, foreword; right-facing pages; blank pages inserted as needed |
| Page numbers | Roman numerals in front matter, Arabic from chapter 1, optional suppression on some pages |
| Headers | Optional: alternating book title / author name; suppressed on chapter openers |
| Chapter openers | First-paragraph style, optional drop cap, no header/footer |
| Images | Inside margins (or sized for bleed); high resolution |
| Export | PDF with fonts embedded and transparencies flattened |

Amazon's template pack also defines paragraph roles (Book Title, Subtitle, Author Name, Copyright Page, Front Matter Body, Chapter Title, First Paragraph, Chapter Body, Subhead, plus Emphasis and Strong). Those are the target **roles** for mapping a user's Word styles.

### Proposed pipeline

```
.docx ──parse──▶ DocumentModel ──apply InteriorStyle──▶ paginated layout ──▶ PDF
                      │                    ▲                                  │
              (chapters, paragraphs,       │                         page count │
               runs, images, breaks)   core/interior.ts                        ▼
                                       (geometry)                   cover generator (Phase 1)
```

1. **Ingest**: parse the `.docx` in the browser/renderer (no upload to a server). Normalize to a small `DocumentModel`: chapters (Heading 1), sections (Heading 2+), paragraphs with inline runs (bold, italic, small caps, links), images, scene breaks, page breaks. Report what couldn't be mapped (tables, footnotes, text boxes, tracked changes).
2. **Style**: an `InteriorStyle` holds trim size, paper, bleed, typography (font, size, leading, indent, justification, hyphenation) and a `ChapterOpenerStyle`. Geometry comes from `src/core/interior.ts`.
3. **Layout and PDF**: see the options below.
4. **Preflight**: page count within KDP limits for the trim/paper, fonts embedded, image resolution, widows/orphans, blank-page insertion for right-facing starts.
5. **Hand-off**: "Your book is 212 pages → make the cover" pre-fills the cover generator.

### Rendering options

| Option | Pros | Cons |
| --- | --- | --- |
| **HTML + CSS Paged Media**, printed to PDF by Chromium (Electron `printToPDF`; Paged.js or the browser's print dialog on the web) | Mirrored margins (`@page :left/:right`), named pages for chapter openers, running headers, drop caps (`initial-letter`/float), no layout engine to write; same code path desktop and web | Pagination quality depends on the engine; margin-box support and fragmentation need verification on the target Chromium |
| Custom layout engine on `pdf-lib` | Total control, deterministic | Very large effort (line breaking, hyphenation, widows/orphans, images) |
| Write a styled `.docx` (apply KDP template styles) | Familiar to Word users; user finishes in Word | No final PDF; fidelity depends on Word; harder to preview |

**Recommendation:** start with Paged-Media HTML → PDF. Offer a styled `.docx` export later as a secondary output.

### Chapter-opener customization

A user-editable `ChapterOpenerStyle`, edited with a live preview of a sample opener, saved as presets:

```ts
interface ChapterOpenerStyle {
  startOn: 'right' | 'any';                  // 'right' inserts a blank verso when needed
  dropFromTop: number;                       // space above the title, inches
  numbering: { show: boolean; format: 'numeral' | 'word' | 'roman'; label: string }; // "Chapter {n}"
  title: { font: string; size: number; align: 'left' | 'center' | 'right'; case: 'asis' | 'upper' | 'small-caps'; spaceAfter: number };
  ornament: { kind: 'none' | 'rule' | 'glyph' | 'image'; value?: string; spaceAfter: number };
  firstParagraph: { indent: boolean; smallCapsWords: number; dropCap?: { lines: number; font?: string; gap: number } };
  suppress: { header: boolean; pageNumber: boolean };
}
```

Ship four presets (Classic, Modern, Minimal, Ornamental) and let users tweak any field. The opener page also drives whether a chapter starts on a recto page.

### Milestones

| # | Deliverable | Notes |
| --- | --- | --- |
| M1 | `DocumentModel` + `.docx` ingestion + import report | Use an existing OOXML reader or parse `document.xml` directly; no network |
| M2 | Paged layout → PDF at KDP geometry (trim/bleed, mirrored margins, page numbers) | Reports final page count |
| M3 | Front matter generator, running headers, roman/arabic numbering | Follows the *Build Your Book* guide |
| M4 | Chapter-opener designer with live preview and presets | UI under a new tab ("Interior formatter" is already reserved) |
| M5 | Preflight checks, page-count hand-off to the cover generator, save/load project files | |

### Risks and open questions

- **DOCX fidelity:** tables, footnotes, equations, tracked changes and text boxes need explicit decisions (support, flatten or warn).
- **Pagination differences:** Chromium's breaks will differ from Word's. We should say so in the UI; the PDF is the source of truth.
- **Fonts and licensing:** embedding is required for KDP. Amazon's *Endure* font ships with Amazon's templates under its own terms; **check the licence before bundling or redistributing it**. Safer default: open-licensed fonts (e.g. EB Garamond, Libre Baskerville), with Endure as an optional user-supplied font.
- **Performance:** 800+ page manuscripts need incremental pagination and a worker.
- **Specs drift:** KDP updates margins and limits; keep numbers in `src/core/specs.ts` and `interior.ts`, tested against its published tables.

## Ideas backlog

- **Image-folder interior for coloring books and planners** (one image per page, bleed and gutter margins, blank reverse pages, front matter). Best added with the Coloring Book Studio integration.
- Preflight: check embedded fonts, the resolution of images placed inside a PDF, color mode and transparency (needs a deeper PDF parser).
- Mockup: open-book and hand-held poses, custom camera presets, batch export of every pose.
- Batch templates for a series (same trim/paper, different page counts)
- Printable PDF "ruler check" sheet
- Localised UI (the folder already has KDP templates in eight languages)
- Import page count from an uploaded PDF interior

### Considered and set aside

- A cover composer that assembles front/back/spine artwork into one file: designers already export a single cover from their design tool.
- ISBN barcode generation: most authors use KDP's free ISBN.
- Royalty and print-cost calculator: KDP shows it at publish time.
- Saved book profiles: not needed yet.
- Embedding as a package or iframe: the core is UI-free, so other apps can lift the logic directly (see ARCHITECTURE.md).
