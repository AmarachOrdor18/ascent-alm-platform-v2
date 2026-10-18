"""Gives every test loan a customer (counterpartyid) so Profitability's Customer view has customers to show.
Safe to re-run: files that already carry the column are left alone."""
import csv
from pathlib import Path

ROOTS = [
    Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\test-files"),
    Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\ascent-alm-v2\sample-data"),
]
CUSTOMERS = ["CORP-ALPHA-INDUSTRIES", "CORP-BETA-ENERGY", "SME-GAMMA-TRADERS", "RETAIL-PERSONAL-LOANS", "CORP-DELTA-TELECOM"]

changed = 0
for root in ROOTS:
    for path in root.rglob("*.csv"):
        if "loan" not in path.name.lower():
            continue
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            header = list(reader.fieldnames or [])
            rows = list(reader)
        lower = [h.lower() for h in header]
        if "counterpartyid" in lower or not rows:
            continue
        code = (rows[0].get("id") or "NG")[:2].upper()
        header.append("counterpartyid")
        for i, r in enumerate(rows):
            r["counterpartyid"] = f"CP-{code}-{CUSTOMERS[i % len(CUSTOMERS)]}"
        try:
            with open(path, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=header)
                w.writeheader()
                w.writerows(rows)
        except PermissionError:
            print("LOCKED (close it in Excel and re-run):", path)
            continue
        changed += 1
        print("updated", path)
print(changed, "file(s) updated")
