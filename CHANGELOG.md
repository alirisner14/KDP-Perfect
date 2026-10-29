# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-10-29

### Changed
- 3D mockup: the spine crease is now off by default (coloring-book covers are smooth and flat) and much subtler when switched on.
- The release workflow no longer builds macOS packages (they could not be tested), and the macOS electron-builder target was removed. Windows and Linux builds are unchanged.

## [0.2.0] - 2026-10-29

Hardcover covers, Kindle eBook covers, Preflight and the 3D mockup.

### Added
- **Hardcover (case laminate) covers.** Binding switch on the book form. Wrap, board, hinge, case spine, safe areas, spine text zone and barcode box, with a hardcover-specific template and measurements. Five trim sizes, black & white (white or cream) or premium color, 76-550 pages. Verified against KDP's live cover calculator.
- **Kindle eBook cover template.** 1600 x 2560 px ideal size, HD and minimum presets or a custom size; template with the border guide and KDP's requirements; JPG/PNG export at exact pixels.
- **Preflight check.** Drop in a finished cover (PDF, PNG or JPG): page size and shape vs the book, page count, effective DPI, file type and size, with diagnosis of common mistakes (rotated, no bleed, front cover only, wrong binding, implied page count). Shows the artwork with the KDP guides on top. PDFs are drawn with pdf.js.
- **3D book mockup.** three.js book with your cover (full wrap or front only): eight poses, matte or glossy, soft shadows, solid/gradient/transparent backgrounds, spine crease, drag-to-orbit; PNG/JPG export in 1:1, 4:5, 2:3, 3:2 and 16:9 up to 4000 px. Paperbacks and hardcovers, left-to-right and right-to-left.
- Groundwood paper (0.00235"/page) for paperbacks.
- Test fixtures from the live KDP calculator (`tests/fixtures/kdp-live-calculator.json`) and tests for hardcover, eBook, preflight, mockup helpers and app state.
- The desktop smoke test now exercises every screen, including pdf.js under `file://` and WebGL.

### Changed
- The app is now a tabbed workspace (Cover template, Kindle eBook, Preflight, 3D mockup) with a shared "Your book" form. The cover Download controls moved under the preview.
- Custom paperback sizes outside 4-8.5" x 6-11.69" are now an error, as in KDP's calculator (they were a warning).
- pdf.js and three.js load only when Preflight or the 3D mockup is first opened.

### Fixed
- **8.25 x 11 removed from paperback presets.** It is a hardcover-only size in KDP's calculator (it was wrongly offered for paperbacks).

### Docs
- `docs/KDP-SPECS.md` documents the hardcover and eBook numbers, the live-calculator checks, and every place KDP's sources disagree.

## [0.1.0] - 2026-10-01

First release: the cover template generator.

### Added
- Cover template generator for KDP paperbacks: enter trim size, ink/paper and page count; get the full-wrap canvas size and a marked-up template.
- Template marks the bleed, trim lines, trim-variance band, front/back safe areas, spine folds, spine text zone and the 2" × 1.2" barcode area, and prints the canvas size and pixel dimensions on the artwork.
- Downloads at actual size as PNG, JPG (DPI-tagged) or PDF (exact page size); transparent guides overlay as PNG or PDF.
- All 16 trim sizes from Amazon's calculator plus 8.25 × 11 and custom sizes; black and color ink, white and cream paper; left-to-right and right-to-left books; "extra cautious" safe-zone option.
- Measurements table, guide-position tables, copy/save of all numbers, in inches, cm or mm.
- Validation: minimum/maximum pages per trim size and paper, spine text availability (79+ pages), unavailable ink/paper combinations.
- Desktop app (Electron, Windows installer and portable exe) and a static web build from the same code.
- Interior margin helpers (`src/core/interior.ts`) as groundwork for the planned interior formatter.
- Test suite with golden values extracted from Amazon's KDP Print File Setup Calculator V5, plus an end-to-end desktop smoke test.

[Unreleased]: https://github.com/ontherisedigital/KDP-Perfect/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/ontherisedigital/KDP-Perfect/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ontherisedigital/KDP-Perfect/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ontherisedigital/KDP-Perfect/releases/tag/v0.1.0
