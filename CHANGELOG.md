# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/alirisner14/KDP-Perfect/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alirisner14/KDP-Perfect/releases/tag/v0.1.0
