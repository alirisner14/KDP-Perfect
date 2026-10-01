# KDP specifications used by this project

Every number the app uses, where it comes from, and where this project made a judgement call. KDP changes its specs from time to time, so **always confirm against KDP before ordering**.

Sources:

- **Calculator**: Amazon's *KDP Print File Setup Calculator V5* (workbook shipped with the project's reference material, not redistributed here). Values were read from its formulas and lookup tables.
- **Help**: KDP help pages, checked October 2026:
  - [Create a Paperback Cover](https://kdp.amazon.com/en_US/help/topic/G201953020)
  - [Paperback Submission Guidelines](https://kdp.amazon.com/en_US/help/topic/G201857950)
  - [Set Trim Size, Bleed, and Margins](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6)
  - [Build Your Book: Format a Paperback Manuscript](https://kdp.amazon.com/help?topicId=G202145400)
- **App choice**: a decision made by this project because KDP doesn't publish a number.

All lengths are in inches.

## Cover

| Constant | Value | Source |
| --- | --- | --- |
| Bleed (top, bottom, outer edges) | 0.125" | Calculator, Help |
| Safe zone, measured from the outer (bleed) edge | 0.25" (= 0.125" bleed + 0.125" trim variance) | Calculator, Help ("0.25" from the outside cover edge") |
| Trim variance | 0.125" | Calculator |
| Spine text margin (each side, inside the spine) | 0.0625" | Calculator, Help |
| Front/back content clearance from the spine fold | 0.125" | **App choice.** KDP publishes only a 0.0625" fold variance; we reuse the trim variance to stay conservative. |
| Barcode box | 2" × 1.2", lower corner of the back cover next to the spine, 0.25" from the spine and bottom trim line | Calculator (placement), Help (size) |
| Minimum pages for spine text | 79 | Help (covers with spine text under 79 pages are rejected) |
| Optional "extra cautious" safe margin | 0.375" from the outer edge (0.25" inside trim) | **App choice**, mirrors the interior bleed rule |

### Formulas

```
spine         = round(pages × thickness, 5)
canvas width  = bleed + trimW + spine + trimW + bleed
canvas height = bleed + trimH + bleed
spine text    = spine − 2 × 0.0625            (zone omitted if pages < 79 or the result ≤ 0)
overall safe  = canvas − 2 × safeMargin       (each axis)
front/back safe area:  outer edge at safeMargin, spine edge 0.125" from the fold
```

`round(x, 5)` is round-half-away-from-zero, matching Excel, which the calculator uses.

### Page thickness

| Ink and paper | Per page | Source |
| --- | --- | --- |
| Black ink, white paper | 0.002252" | Calculator, Help |
| Black ink, cream paper | 0.0025" | Calculator, Help |
| Premium color, white paper | 0.002347" | Calculator ("Color Ink & White Paper"), Help |
| Standard color, white paper | 0.002252" | Help (not in the calculator) |

## Page counts

Minimum **24**. Maximum by trim size and paper (Calculator):

| Trim sizes | Cream | White | Color |
| --- | --- | --- | --- |
| 5 × 8, 5.06 × 7.81, 5.25 × 8, 5.5 × 8.5, 6 × 9, 6.14 × 9.21, 6.69 × 9.61, 7 × 10, 7.44 × 9.69, 7.5 × 9.25, 8 × 10 | 776 | 828 | 828 |
| 8.25 × 6, 8.25 × 8.25 | 750 | 800 | 800 |
| 8.5 × 8.5, 8.5 × 11 | 550 | 590 | 590 |
| 8.27 × 11.69 (A4) | 730 | 780 | not available |

## Interior (used by the planned interior formatter)

| Pages | Inside (gutter) margin |
| --- | --- |
| 24 to 150 | 0.375" |
| 151 to 300 | 0.5" |
| 301 to 500 | 0.625" |
| 501 to 700 | 0.75" |
| 701 to 828 | 0.875" |

Outside, top and bottom margins: at least **0.25"** without bleed, **0.375"** with bleed. With bleed the page is trim + 0.125" wide and trim + 0.25" tall. Source: Calculator and the *Build Your Book* guide.

## Known discrepancies and open questions

1. **The calculator's manuscript "Safe Zone" width is wrong above 150 pages.** `Main!U7` looks up column 4 of `LU_Margins`, which is *Outside margin – Bleed* (always 0.375"), instead of column 2, the gutter. For 6 × 9 at 333 pages it reports 5.375" instead of 5.125". This project uses the gutter chart from the *Build Your Book* guide, which agrees with the correct value. The cover calculations are not affected.
2. **8.25 × 11** appears in Amazon's manuscript templates but not in the calculator. It is offered as a preset with no page limit beyond the global 24 to 828 (776 for cream).
3. **Custom trim sizes.** The calculator defines no limits. The app shows a soft warning outside 4"–8.5" wide and 6"–11.69" tall; verify against KDP.
4. **Millimetre rounding.** The calculator multiplies pages by a pre-rounded mm thickness; this app converts from inches. Differences are below 0.001 mm.
5. **Raster export size.** Images are whole pixels, so at 300 DPI they can differ from the exact size by up to half a pixel (1/600"). PDF page sizes are exact.
6. **Right-to-left books** are mirrored (front on the left). The calculator has a hidden `Cover-RTL` sheet for this; its layout was not available as numbers, so the mirror is derived.

## Updating the specs

Edit `src/core/specs.ts` (constants, paper types, trim sizes, page limits), run `npm test`, and update this page. The golden test in `tests/cover.test.ts` compares the maths against values extracted from Amazon's calculator (`tests/fixtures/calculator-golden.json`, regenerated with `scripts/extract-calculator-fixtures.py`).
