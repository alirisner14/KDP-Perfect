# User guide

## 1. Describe your book

| Field | What to enter |
| --- | --- |
| **Trim size** | The finished page size you chose on KDP. Pick **Custom size…** for anything else (enter inches, cm or mm; switch units above the preview). |
| **Ink and paper** | Must match your KDP print options. Paper thickness drives the spine width. |
| **Number of pages** | The page count of your *finished interior* as KDP will print it. The spine is sized from this number, so if your page count changes, regenerate the template. |
| **Advanced → Reading direction** | Left to right (back | spine | front) or right to left for languages such as Japanese. |
| **Advanced → Safe-zone margin** | *KDP standard* (0.25" from the outer edge, as in KDP's calculator) or *extra cautious* (0.375" from the edge, i.e. 0.25" inside the trim line). |
| **Advanced → Image resolution** | 300 DPI for print. 150 DPI makes smaller files for quick checks. |

Messages under the form tell you when something is out of range (too few or too many pages, an ink/paper combination KDP doesn't offer at that size, spine text not allowed).

## 2. Read the canvas size

The card at the top shows the size to create your design at, in your chosen unit, the other two units, and in pixels at your DPI. **Copy size** puts it on the clipboard.

The **Measurements** table lists every zone (bleed, trim, spine, spine text, safe areas, barcode). **Guide positions** gives distances from the top-left corner of the canvas, so you can place rulers or shapes by number.

## 3. Download

| Version | File types | Use it to |
| --- | --- | --- |
| **Template** | PNG, JPG, PDF | See all the zones labelled; upload as a background guide |
| **Guides overlay** | PNG, PDF | Lay transparent guides *over* your finished artwork to check it (JPG can't be transparent) |

- **PNG** is lossless. **JPG** is smaller. Both are tagged with your DPI so design tools open them at the real size.
- **PDF** is vector, one page, exactly the cover size. Print it at 100% and measure with a ruler to prove the dimensions.
- **Copy measurements** / **Save as text** give a plain-text summary with all the numbers.

On the desktop app each download opens a Save As dialog; in a browser files go to your downloads folder.

## 4. Colour key

| Mark | Meaning |
| --- | --- |
| Red band | **Bleed.** Extend backgrounds and images into it. It is trimmed off. |
| Amber band | **Trim variance.** The cutter can drift here; keep text and key details out. |
| Green dashed box | **Safe area** for the back and front covers |
| Blue dashed box | **Spine text zone** (0.0625" clear of each fold; only for 79+ pages) |
| Black dashed line | **Trim line** |
| Purple dashed lines | **Spine folds** |
| White dashed box | **Barcode area.** KDP places an ISBN barcode here if you don't supply one |

## 5. Finish in your design tool

See [Using a template in Canva](../README.md#using-a-template-in-canva). When you export for KDP use a **PDF**, and make sure the tool isn't adding its own bleed or crop marks.

## FAQ

**Why is my spine text zone missing?** KDP rejects covers with spine text under 79 pages. The spine is still shown so you can keep it clear.

**My page count changed. Do I need a new template?** Yes. Spine width, and therefore the whole canvas width, changes with the page count.

**Do the numbers match KDP's calculator?** Yes, for all 16 of its trim sizes. They are checked automatically. See [KDP-SPECS.md](KDP-SPECS.md).

**Is anything uploaded?** No. Everything is computed on your computer.
