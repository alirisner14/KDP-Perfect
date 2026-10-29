# KDP Perfect

**Cover templates, preflight checks and 3D mockups for Amazon KDP.** Enter your trim size, paper and page count and get an exact-size full-wrap cover template for paperbacks or hardcovers, a Kindle eBook cover template, a check of your finished cover against KDP's size rules, and a 3D book mockup, including a square 1:1 image.

<p align="center">
  <img src="docs/images/sample-template-6x9-200pp.svg" alt="Sample cover template for a 6 x 9 inch, 200 page book" width="760">
</p>

> **Status:** v0.2. Hardcover covers, Kindle eBook covers, Preflight and the 3D mockup join the paperback template from v0.1 (see the [changelog](CHANGELOG.md)). The Word-to-KDP-interior formatter is planned, see the [roadmap](docs/ROADMAP.md).
>
> KDP Perfect is an independent project. It is not affiliated with, endorsed by, or sponsored by Amazon. "Amazon", "KDP" and "Kindle Direct Publishing" are trademarks of Amazon.com, Inc. or its affiliates.

## What it does

| Tool | What you get |
| --- | --- |
| **Cover template** | The exact canvas size (in, cm, mm, px) and a marked-up template for a **paperback** or **hardcover** (case laminate): bleed or wrap, trim lines, hinge, safe areas, spine text zone and barcode box. Download as PNG, JPG or PDF at actual size, plus a transparent guides overlay. |
| **Kindle eBook** | The 1600 × 2560 px front-cover template (or any custom size) with KDP's rules: ratio, limits, border, what to leave out. |
| **Preflight** | Drop in your finished cover (PDF, PNG or JPG). It checks the page size and shape against your book, flags low resolution, and explains mismatches ("the width suggests a 240-page spine"). Your artwork is shown with the guides on top. |
| **3D mockup** | A real 3D book with your cover on it: eight poses (standing, front-on, floating, pair, stack, lying flat, back, spine), matte or glossy, soft shadows, transparent or coloured backgrounds, and **1:1 / 4:5 / 2:3 / 3:2 / 16:9** output. Works for paperbacks and hardcovers, including square trims. |

Also: all KDP paperback trim sizes plus custom sizes, the five paperback papers (including groundwood and standard color), hardcover sizes, right-to-left books, page-count limits, and a "guide positions" table for placing rulers by number. Everything runs on your computer; nothing is uploaded.

## Install

### Desktop app (Windows, macOS, Linux)

Download the installer or portable build from the [Releases](https://github.com/ontherisedigital/KDP-Perfect/releases) page, or build it yourself (below).

### Run from source

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/ontherisedigital/KDP-Perfect.git
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

1. Enter your book details and note the **canvas size** at the top of the Cover template page.
2. In Canva choose **Create a design → Custom size** and enter that width and height (inches work; so do pixels).
3. Download the **Template** (PNG or JPG) or the transparent **Guides overlay** (PNG), upload it to Canva and stretch it to fill the page.
4. Lock it, design inside the green safe areas, and let backgrounds run into the red bleed (paperback) or wrap (hardcover).
5. Hide or delete the template, then export a **PDF** for KDP. Don't add crop marks or extra bleed in the export settings; the canvas already includes it.
6. Drop the PDF into **Preflight** to confirm it matches your book before you upload.

The same steps work in Affinity, Photoshop, Illustrator, InDesign, GIMP or Word.

## How the numbers are calculated

Every figure is checked against **KDP's own cover calculator**: the paperback numbers against the V5 workbook and the hardcover numbers against the live calculator. The test suite fails if they drift. Sources and the places they disagree are in [docs/KDP-SPECS.md](docs/KDP-SPECS.md).

| Measure | Paperback | Hardcover (case laminate) |
| --- | --- | --- |
| Outer ring | 0.125" bleed | 0.591" wrap (15 mm) |
| Cover panels | trim size | board = trim + 0.197" wide, + 0.236" tall |
| Spine | pages × thickness | pages × thickness + 0.189" |
| Canvas width | bleed + trim + spine + trim + bleed | wrap + board + spine + board + wrap |
| Safe zone | 0.25" from the canvas edge | 0.125" inside the board edge; 0.394" hinge beside the spine |
| Spine text | spine − 2 × 0.0625", 79+ pages | spine − 2 × 0.0625" |
| Pages | 24–828 (per size and paper) | 76–550 |

Page thickness: white 0.002252", cream 0.0025", groundwood 0.00235", premium color 0.002347", standard color 0.002252".

## Project layout

```
src/core/      pure TypeScript: specs, cover maths, eBook, preflight, scene builder, renderers, mockup helpers
src/app/       the UI (vanilla TypeScript + CSS): shell, shared book form, one module per screen
src/app/mockup/   the three.js book (loaded only when the 3D mockup is opened)
electron/      desktop shell (main process, preload bridge)
tests/         unit tests (Vitest) with golden data from KDP's calculators
scripts/       dev, icon and end-to-end smoke-test helpers
docs/          architecture, KDP specs, roadmap, user guide
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together and how the same code runs as a desktop and a web app. The core has no UI dependencies, so it can be reused in other apps.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `dev:desktop` | Develop in the browser / in the desktop shell |
| `npm test` | Run the unit tests |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type check and build the web app into `dist/` |
| `npm run smoke` | Launch the real Electron app and exercise every screen: exports, preflight (pdf.js), 3D mockup (WebGL) |
| `npm run dist:win` | Package the Windows installer and portable exe |

## Roadmap

Next up: upload a Word document and get a KDP-ready interior (trim size, mirrored margins, chapter starts, page numbers, front matter) with a customizable chapter opening page. Details in [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first. Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Amazon's calculator, templates and fonts are Amazon's property; they are **not** included in this repository and are listed in `.gitignore` so they can't be committed by accident.
