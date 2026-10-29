# KDP specifications used by this project

Every number the app uses, where it comes from, and where this project made a judgement call. KDP changes its specs from time to time, so **always confirm against KDP before ordering**.

Sources, in order of authority:

- **Live calculator**: KDP's public [Print Cover Calculator](https://kdp.amazon.com/cover-calculator), run on 2026-10-29. It is the ground truth for hardcover and the most current for paperback. Its results are stored in `tests/fixtures/kdp-live-calculator.json` and checked by `tests/live-calculator.test.ts`.
- **Calculator V5**: Amazon's *KDP Print File Setup Calculator V5* workbook (the reference folder next to this repo, not redistributed). Values were read from its formulas and lookup tables; they are in `tests/fixtures/calculator-golden.json`.
- **Help**: KDP help pages, checked 2026-10-29:
  - [Create a Paperback Cover](https://kdp.amazon.com/en_US/help/topic/G201953020)
  - [Create a Hardcover Cover](https://kdp.amazon.com/en_US/help/topic/GDTKFJPNQCBTMRV6)
  - [Paperback Submission Guidelines](https://kdp.amazon.com/en_US/help/topic/G201857950)
  - [Set Trim Size, Bleed, and Margins](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6)
  - [Build Your Book: Format a Paperback Manuscript](https://kdp.amazon.com/help?topicId=G202145400)
  - [Cover Image Guidelines for Kindle eBooks](https://kdp.amazon.com/en_US/help/topic/G6GTK3T3NUHKLEFX) and [eBook cover criteria](https://kdp.amazon.com/en_US/help/topic/G200645690)
- **App choice**: a decision made by this project because KDP doesn't publish a number.

All lengths are in inches.

## Paperback cover

| Constant | Value | Source |
| --- | --- | --- |
| Bleed (top, bottom, outer edges) | 0.125" | Live calculator, Calculator V5, Help |
| Safe zone, measured from the outer (bleed) edge | 0.25" (= 0.125" bleed + 0.125" trim variance) | Live calculator (front safe area = trim − 0.125" wide, − 0.25" tall), Help |
| Trim variance | 0.125" | Calculator V5 |
| Spine text margin (each side, inside the spine) | 0.0625" | Live calculator, Help |
| Front/back content clearance from the spine fold | 0.125" | **App choice.** The live calculator's front safe area runs right up to the spine; we hold back 0.125" (the trim variance) to stay conservative. |
| Barcode box | 2" × 1.2", lower corner of the back cover next to the spine, 0.25" from the spine and the bottom trim line | Live calculator (0.25" / 0.25"), Help |
| Minimum pages for spine text | 79 | Help (paperback covers with spine text under 79 pages are rejected) |
| Optional "extra cautious" safe margin | 0.375" from the outer edge (0.25" inside trim) | **App choice**, mirrors the interior bleed rule |
| Custom trim size | 4"–8.5" wide, 6"–11.69" tall | Live calculator (rejects values outside this window) |

### Formulas

```
spine         = round(pages × thickness, 5)
canvas width  = bleed + trimW + spine + trimW + bleed
canvas height = bleed + trimH + bleed
spine text    = spine − 2 × 0.0625            (zone omitted if pages < 79 or the result ≤ 0)
overall safe  = canvas − 2 × safeMargin       (each axis)
front/back safe area:  outer edge at safeMargin, spine edge 0.125" from the fold
```

`round(x, 5)` is round-half-away-from-zero, matching Excel, which the V5 workbook uses. The live calculator displays three decimals, so this app's values can differ from it by up to 0.0005".

### Page thickness

| Ink and paper | Per page | Source |
| --- | --- | --- |
| Black ink, white paper | 0.002252" | Live calculator, V5, Help |
| Black ink, cream paper | 0.0025" | Live calculator, V5, Help |
| Black ink, groundwood paper | 0.00235" | Live calculator (100 pp → 0.235", 400 pp → 0.94"); newer than V5 |
| Premium color, white paper | 0.002347" | Live calculator, V5, Help |
| Standard color, white paper | 0.002252" | Live calculator, Help (not in V5) |

## Hardcover (case laminate) cover

All values were read from KDP's live calculator; its figures are the metric sizes converted to inches, so `src/core/specs.ts` keeps them in millimetres.

| Constant | Value | Source |
| --- | --- | --- |
| Wrap (artwork past the board edge, all four sides) | 15 mm = 0.591" | Live calculator ("Wrap"), Help |
| Board (front/back cover) | trim + 5 mm wide (0.197"), + 6 mm tall (0.236") | Live calculator ("Front Cover" 6.197" × 9.236" for 6 × 9) |
| Hinge (band beside the spine to keep text and barcodes out of) | 10 mm = 0.394" | Live calculator, Help |
| Margin inside the board edge | 0.125" | Live calculator ("Margin") |
| Spine | pages × thickness + 4.8 mm (0.189") | Live calculator (10 data points) |
| Spine safe area | spine − 2 × 0.0625" wide; board height − 0.25" tall | Live calculator |
| Barcode | 2" × 1.2"; 0.375" above the bottom board edge; 0.25" beyond the hinge | Live calculator ("Barcode Margin" 0.25 / 0.375); the Help page words this differently (see below) |
| Pages | 76–550 | Live calculator ("Page count must be between 76 - 550") |
| Trim sizes | 5.5 × 8.5, 6 × 9, 6.14 × 9.21, 7 × 10, 8.25 × 11 | Live calculator |
| Ink and paper | Black & white (white, cream); premium color (white). No standard color, no groundwood. | Live calculator |
| Spine text | No minimum page count is published; the 79-page rule is paperback-only. The spine is always at least 0.36" wide at 76 pages. | Help (silent) |

```
board         = trim + (0.19685", 0.23622")
spine         = pages × thickness + 0.18898
canvas width  = 2 × 0.59055 + 2 × boardW + spine
canvas height = 2 × 0.59055 + boardH
safe (each board): 0.125" inside the board edge on three sides, 0.394" from the spine edge on the fourth
```

Checked data points (6 × 9, black & white, white paper): 76 pp → 13.935" × 10.417"; 200 pp → 14.214"; 400 pp → 14.665"; 550 pp → 15.002". Other sizes at 200 pp: 5.5 × 8.5 → 13.214" × 9.917"; 6.14 × 9.21 → 14.494" × 10.627"; 7 × 10 → 16.214" × 11.417"; 8.25 × 11 → 18.714" × 12.417". Cream at 200 pp: 14.264".

## Kindle eBook cover

| Requirement | Value | Source |
| --- | --- | --- |
| Ideal size | 1600 px wide × 2560 px tall (ratio 1.6:1) | Help (both pages) |
| HD devices | 2500 px tall | Help |
| Minimum | 1000 × 625 px | eBook cover criteria page |
| Absolute floor | 500 px on the longest side (marketing cover) | Cover Image Guidelines page |
| Maximum | 10,000 px on each side | Both pages |
| Ratio | height / width at least 1.6:1 | eBook cover criteria page |
| Format | JPEG preferred; PNG, TIFF accepted | Guidelines page (JPEG, PNG, GIF, TIFF) vs criteria page (TIFF, JPEG) |
| Size and color | under 50 MB; RGB (CMYK is converted) | Both pages |
| Resolution | 300 PPI recommended (the criteria page also says 72 dpi) | Both pages |
| Light covers | add a 3–4 px medium-gray border | Guidelines page |
| Content | title and author; no spine, barcode, back cover, flaps, prices or promotions | Guidelines page |
| Suggested text margin (6% of width) | design aid only | **App choice** |

## Page counts

Paperback minimum **24**. Maximum by trim size and paper (Calculator V5 and the Help table):

| Trim sizes | Cream | White / groundwood | Color |
| --- | --- | --- | --- |
| 5 × 8, 5.06 × 7.81, 5.25 × 8, 5.5 × 8.5, 6 × 9, 6.14 × 9.21, 6.69 × 9.61, 7 × 10, 7.44 × 9.69, 7.5 × 9.25, 8 × 10 | 776 | 828 | 828 |
| 8.25 × 6, 8.25 × 8.25 | 750 | 800 | 800 |
| 8.5 × 8.5, 8.5 × 11 | 550 | 590 | 590 |
| 8.27 × 11.69 (A4) | 730 | 780 | not available |

Groundwood has no separate limit in any source; the white column is used.

## Interior (used by the planned interior formatter)

| Pages | Inside (gutter) margin |
| --- | --- |
| 24 to 150 | 0.375" |
| 151 to 300 | 0.5" |
| 301 to 500 | 0.625" |
| 501 to 700 | 0.75" |
| 701 to 828 | 0.875" |

Outside, top and bottom margins: at least **0.25"** without bleed, **0.375"** with bleed. With bleed the page is trim + 0.125" wide and trim + 0.25" tall. Source: Calculator V5 and the *Build Your Book* guide.

## Preflight tolerances (app choices)

KDP publishes no size tolerance for uploaded covers. This app treats a page within **±0.005"** of the expected size as an exact match, within **±0.03"** as "close, re-export to be safe", and anything else as wrong. Images are judged by proportion (±0.2% pass, ±1% close) and by effective DPI over the full cover (300 expected; a warning below 299, a failure below 150). File size: over 650 MB fails (KDP cannot convert it); over 40 MB warns (Amazon's recommendation, stated on both the paperback and hardcover cover pages). KDP accepts a paperback cover only as a single PDF, so an image upload gets a warning.

## Known discrepancies and open questions

1. **Calculator V5's manuscript "Safe Zone" width is wrong above 150 pages.** `Main!U7` looks up column 4 of `LU_Margins`, which is *Outside margin – Bleed* (always 0.375"), instead of column 2, the gutter. For 6 × 9 at 333 pages it reports 5.375" instead of 5.125". This project uses the gutter chart from the *Build Your Book* guide. The cover calculations are not affected.
2. **8.25 × 11 is a hardcover size only.** Amazon's manuscript templates include it, but the live paperback calculator does not offer it. (An earlier version of this project listed it as a paperback preset; it was removed.)
3. **Paperback page limits.** The live calculator only enforces 24–830 pages for any size; the Help table and the V5 workbook list per-size limits (828 for most, 590 for 8.5 × 8.5 and 8.5 × 11, and so on) and the cream limit of 776. This app keeps the stricter per-size values.
4. **Hardcover barcode.** The Help page says to keep an own barcode at least 0.76" from the bottom of the cover and 0.25" from the hinge; the calculator says 0.375" above the board bottom, which is 0.966" from the cover edge once the wrap is counted. The calculator's (more conservative) value is used.
5. **Hardcover Help-page typo.** It gives the wrap as "0.51 in (15 mm)"; 15 mm is 0.591", which is what the calculator shows.
6. **eBook cover.** The two KDP pages disagree on the minimum (500 px longest side vs 1000 × 625), accepted formats (TIFF/JPEG vs JPEG/PNG/GIF/TIFF) and DPI (72 vs 300). The app warns below the stricter figure and errors only below the hard floor.
7. **Dust jackets.** The live calculator contains a hidden "Dust Jacket" option that currently returns the case-laminate numbers, so it is not offered here.
8. **Millimetre rounding.** The V5 workbook multiplies pages by a pre-rounded mm thickness; this app converts from inches. Differences are below 0.001 mm.
9. **Raster export size.** Images are whole pixels, so at 300 DPI they can differ from the exact size by up to half a pixel (1/600"). PDF page sizes are exact.
10. **Right-to-left books** are mirrored (front on the left). The calculators confirm the dimensions are identical; the mirror layout is derived.

## Updating the specs

Edit `src/core/specs.ts` (constants, paper types, trim sizes, page limits), run `npm test`, and update this page. To add ground truth, run KDP's live calculator, copy the results into `tests/fixtures/kdp-live-calculator.json`, and the tests compare against them. The V5 fixture is regenerated with `scripts/extract-calculator-fixtures.py`.
