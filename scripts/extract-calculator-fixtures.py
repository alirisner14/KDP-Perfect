"""
One-off helper: reads the cached values in Amazon's "KDP Print File Setup Calculator V5" workbook
and writes tests/fixtures/calculator-golden.json.

The workbook is Amazon's property and is NOT part of this repo; only the extracted numbers are.
The workbook's cached state is: 333 pages, black ink + cream paper (0.0025" per page).

Usage:  python scripts/extract-calculator-fixtures.py path/to/KDP_Print_File_Setup_Calculator_V5.xlsm
"""
import html
import json
import re
import sys
import zipfile
from pathlib import Path

src = sys.argv[1]
z = zipfile.ZipFile(src)
shared = [
    html.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, flags=re.S)))
    for si in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode("utf8"), flags=re.S)
]
sheet = z.read("xl/worksheets/sheet6.xml").decode("utf8")  # "Lists"

cells = {}
for ref, attrs, body in re.findall(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>(.*?)</c>)', sheet, flags=re.S):
    if not body:
        continue
    v = re.search(r"<v>(.*?)</v>", body, flags=re.S)
    if not v:
        continue
    val = v.group(1)
    if 't="s"' in attrs:
        val = shared[int(val)]
    cells[ref] = val


def num(ref):
    return float(cells[ref])


trims = []
for row in range(3, 19):  # LU_TrimSizes data rows
    trims.append(
        {
            "width": num(f"Z{row}"),
            "height": num(f"AA{row}"),
            "coverWidth": round(num(f"AY{row}"), 5),
            "coverHeight": round(num(f"BB{row}"), 5),
            "coverSafeWidth": round(num(f"BG{row}"), 5),
            "coverSafeHeight": round(num(f"BK{row}"), 5),
            "maxPages": {
                "cream": int(num(f"BO{row}")),
                "white": int(num(f"BP{row}")),
                "color": int(num(f"BQ{row}")),
            },
        }
    )

out = {
    "_comment": "Cached values from KDP Print File Setup Calculator V5, state: 333 pages, black ink + cream paper.",
    "pageCount": 333,
    "paper": "bw-cream",
    "trims": trims,
}
dest = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "calculator-golden.json"
dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf8")
print(f"wrote {dest} with {len(trims)} trim sizes")
