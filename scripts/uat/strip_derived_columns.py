"""Makes the Nigeria and Ghana test position files look like real bank extracts: drops the columns the platform
works out itself (product code from product class; HQLA level, haircut, LCR role, rate sensitivity and duration
from the product characteristics assumption). Kenya's files already have the bank's own shape. Safe to re-run."""
import csv
from pathlib import Path

ROOTS = [
    Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\test-files"),
    Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\ascent-alm-v2\sample-data"),
]
DERIVED = {"productcode", "hqlalevel", "hqlahaircutpct", "lcrcashflowrole", "irrbbratesensitive", "approxdurationyears"}
# The mapping test renames columns; its renamed product column is derived too.
RENAMED = {"PRODUCT"}

changed = 0
for root in ROOTS:
    for path in root.rglob("*.csv"):
        name = path.name.lower()
        if not any(k in name for k in ("loan", "deposit", "treasury")):
            continue
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            header = list(reader.fieldnames or [])
            rows = list(reader)
        keep = [h for h in header if h.lower() not in DERIVED and h not in RENAMED]
        if keep == header:
            continue
        try:
            with open(path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=keep, extrasaction="ignore")
                w.writeheader()
                w.writerows(rows)
        except PermissionError:
            print("LOCKED (close it in Excel and re-run):", path)
            continue
        changed += 1
        print("cleaned", path.relative_to(root.parent))
print(changed, "file(s) cleaned")
