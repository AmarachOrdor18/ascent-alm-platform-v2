"""Extra UAT input files for the teardown features: a second month (append vs replace), renamed columns
(inline column mapping), a new product code (derivation) and a currency with no FX rate (hard blocker)."""
import csv
import shutil
from pathlib import Path

REPO = Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\ascent-alm-v2")
NG = Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\test-files\2_Nigeria_NG")

# 1. Second month for Nigeria (31 Aug 2026): added alongside July, never replacing it.
aug = NG / "2026-08-31_second_month"
aug.mkdir(exist_ok=True)
for name in ("loans.csv", "deposits.csv", "treasury.csv", "gl_ledger.csv"):
    shutil.copy(REPO / "sample-data" / "nigeria" / "2026-08-31" / name, aug / name)


def rows(path: Path) -> tuple[list[str], list[dict]]:
    with open(path, newline="") as f:
        r = csv.DictReader(f)
        return list(r.fieldnames or []), list(r)


def write(path: Path, header: list[str], data: list[dict]) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(data)


tests = NG / "special_tests"
tests.mkdir(exist_ok=True)

# 2. Same loans, bank-style column names - the inline mapping must ask about these.
header, data = rows(NG / "loans.csv")
rename = {"amount": "OUTSTANDING_BAL", "productcode": "PRODUCT", "currency": "CCY", "maturitydate": "MATURITY_DT", "interestratepct": "INT_RATE"}
write(tests / "MAPPING_TEST_loans_renamed_columns.csv", [rename.get(h, h) for h in header],
      [{rename.get(k, k): v for k, v in r.items()} for r in data])

# 3. A loan with a product code the platform has never seen - it must be created on admit, not block.
first = dict(data[0])
first.update(id=first["id"] + "-AGRI", productcode="LOAN-AGRI", productclass="Loans - Agricultural Facility", amount="25000000000")
write(tests / "DERIVATION_TEST_loans_new_product.csv", header, data + [first])

# 4. A treasury position in ZAR - no FX rate exists for ZAR, so a run must be blocked with a clear reason.
th, td = rows(NG / "treasury.csv")
zar = dict(td[0])
zar.update(id=zar["id"] + "-ZAR", currency="ZAR", amount="1500000000")
write(tests / "MISSING_FX_TEST_treasury_with_ZAR.csv", th, td + [zar])

readme = NG.parent / "README.txt"
text = readme.read_text(encoding="utf-8")
if "special_tests" not in text:
    text += (
        "\nExtra files (Nigeria):\n"
        "  2_Nigeria_NG/2026-08-31_second_month   loans/deposits/treasury/gl_ledger for 31 Aug 2026 - added next to July (append test).\n"
        "  2_Nigeria_NG/special_tests/MAPPING_TEST_loans_renamed_columns.csv   bank-style column names - inline mapping test.\n"
        "  2_Nigeria_NG/special_tests/DERIVATION_TEST_loans_new_product.csv    adds product LOAN-AGRI - created automatically on admit.\n"
        "  2_Nigeria_NG/special_tests/MISSING_FX_TEST_treasury_with_ZAR.csv    a ZAR position with no FX rate - run must be blocked.\n"
        "Full step-by-step guide: ALM_UAT_Walkthrough.md (in this folder).\n"
    )
    readme.write_text(text, encoding="utf-8")
print("extra test files written")
