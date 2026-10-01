# KDP Perfect

**Exact-size cover templates for Amazon KDP paperbacks.** Enter your trim size, paper and page count and get a ready-to-use full-wrap cover template with the bleed, safe zones, spine text area and barcode box clearly marked, plus the precise canvas size to type into Canva (or any design tool).

<p align="center">
  <img src="docs/images/sample-template-6x9-200pp.svg" alt="Sample cover template for a 6 x 9 inch, 200 page book" width="760">
</p>

> **Status:** v0.1: cover template generator. The Word-to-KDP-interior formatter is planned, see the [roadmap](docs/ROADMAP.md).
>
> KDP Perfect is an independent project. It is not affiliated with, endorsed by, or sponsored by Amazon. "Amazon", "KDP" and "Kindle Direct Publishing" are trademarks of Amazon.com, Inc. or its affiliates.

## Features

- **Correct canvas size, instantly.** Width and height in inches, cm, mm and pixels, with a one-click copy. The size is printed on the template itself, too.
- **Everything marked on the artwork:** bleed (0.125"), trim lines, trim-variance band, safe areas for the front cover, back cover and spine text, spine folds and the 2" × 1.2" barcode area.
- **Spine maths from KDP's numbers.** Spine width and spine-text width from your page count and paper type. Warns when the spine can't carry text (KDP needs 79+ pages).
- **Download at actual size** as **PNG**, **JPG** or **PDF**. Images carry their DPI so they open at real inches; the PDF page is exactly the cover size. A transparent **guides overlay** (PNG/PDF) lets you lay the guides over finished artwork.
- **All KDP trim sizes** plus custom sizes, black or color ink, white or cream paper, right-to-left books, and a more cautious safe-zone option.
- **Guide positions table** so you can place rulers and shapes by number.
- **Limits enforced:** minimum and maximum page counts per trim size and paper.
- **Works offline,** keeps your data on your machine. No account, no tracking.

## Install

### Desktop app (Windows)

Download the installer or the portable `.exe` from the [Releases](https://github.com/alirisner14/KDP-Perfect/releases) page, or build it yourself (below).

### Run from source

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/alirisner14/KDP-Perfect.git
cd KDP-Perfect
npm install
```

```bash
npm run dev:desktop   # desktop window with hot reload
npm run dev           # same UI in your browser at http://localhost:5173
```

### Build it

```bash
npm run build         # web build into dist/ (static files, host anywhere)
npm run dist:win      # Windows installer + portable exe into release/
npm run dist          # installer for the OS you are running on
```

The first desktop command downloads the Electron binary (about 100 MB) once.

## Using a template in Canva

1. Enter your book details and note the **canvas size** at the top of the page.
2. In Canva choose **Create a design → Custom size** and enter that width and height (inches work; so do pixels).
3. Download the **Template** (PNG or JPG) or the transparent **Guides overlay** (PNG), upload it to Canva and stretch it to fill the page.
4. Lock it, design inside the green safe areas, and let backgrounds run into the red bleed.
5. Hide or delete the template, then export a **PDF** for KDP. Don't add crop marks or extra bleed in the export settings; the canvas already includes the bleed.

The same steps work in Affinity, Photoshop, Illustrator, InDesign, GIMP or Word: make a document at the canvas size and place the template as a guide layer.

## How the numbers are calculated

All values come from Amazon's *KDP Print File Setup Calculator V5* and KDP's help pages. Every number and its source is listed in [docs/KDP-SPECS.md](docs/KDP-SPECS.md).

| Measure | Rule |
| --- | --- |
| Spine width | pages × page thickness (white 0.002252", cream 0.0025", premium color 0.002347", standard color 0.002252") |
| Canvas width | bleed + trim width + spine + trim width + bleed |
| Canvas height | bleed + trim height + bleed |
| Bleed | 0.125" on every outer edge |
| Safe zone | 0.25" from the outer canvas edge (0.125" inside the trim line) |
| Spine text zone | spine width − 2 × 0.0625", only for 79+ pages |
| Barcode area | 2" × 1.2", 0.25" from the spine and the bottom trim line |

The calculations are verified in the test suite against every trim size in Amazon's own calculator.

## Project layout

```
src/core/      pure TypeScript: specs, cover maths, scene builder, SVG/PNG/JPG/PDF renderers
src/app/       the UI (vanilla TypeScript + CSS, no framework)
electron/      desktop shell (main process, preload bridge)
tests/         unit tests (Vitest), including golden data from Amazon's calculator
scripts/       dev, icon and end-to-end smoke-test helpers
docs/          architecture, KDP specs, roadmap, user guide
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together and how the same code runs as a desktop and a web app.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `dev:desktop` | Develop in the browser / in the desktop shell |
| `npm test` | Run the unit tests |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type check and build the web app into `dist/` |
| `npm run smoke` | Launch the real Electron app, export PNG/JPG/PDF and inspect the files |
| `npm run dist:win` | Package the Windows installer and portable exe |

## Roadmap

Next up: upload a Word document and get a KDP-ready interior (trim size, mirrored margins, chapter starts, page numbers, front matter) with a customizable chapter opening page. Details in [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first. Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Amazon's calculator, templates and fonts are Amazon's property; they are **not** included in this repository and are listed in `.gitignore` so they can't be committed by accident.
