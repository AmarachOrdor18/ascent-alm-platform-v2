"""Builds test-files/1_Group_market_data/market_data_<date>.xlsx for a later month-end (default 2026-08-31): the same
three sheets as the July file (FX rates, Yield curves, Policy rates), every row dated that month-end, with small
month-on-month moves. Policy rates carry the July file's history plus the new month.

    python scripts/uat/make_market_data_month.py            # 2026-08-31
    python scripts/uat/make_market_data_month.py 2026-09-30
"""
import sys
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill

GROUP = Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\test-files\1_Group_market_data")
AS_OF = sys.argv[1] if len(sys.argv) > 1 else "2026-08-31"
MONTHS_ON = {"2026-08-31": 1, "2026-09-30": 2}.get(AS_OF, 1)

FX = {"NGN": 1550.00, "GHS": 15.20, "KES": 129.40, "XOF": 605.50, "EUR": 0.92, "ZMW": 26.10}
FX_MOVE = {"NGN": 0.0097, "GHS": 0.0066, "KES": -0.0023, "XOF": 0.0040, "EUR": 0.0043, "ZMW": 0.0080}
CURVES = {
    ("NGN", "NGN-NIBOR"): [(1, 18.5), (30, 19.0), (90, 19.8), (180, 20.4), (365, 21.0), (1095, 17.5), (1825, 16.0), (3650, 15.2)],
    ("GHS", "GHS-GHREF"): [(1, 26.0), (30, 26.8), (90, 27.5), (180, 28.0), (365, 28.4), (1095, 24.0), (1825, 22.5), (3650, 21.0)],
    ("KES", "KES-KESONIA"): [(1, 12.6), (30, 12.9), (90, 13.4), (180, 13.8), (365, 14.2), (1095, 14.9), (1825, 15.3), (3650, 15.8)],
    ("USD", "USD-SOFR"): [(1, 5.30), (30, 5.32), (90, 5.35), (180, 5.20), (365, 4.95), (1095, 4.30), (1825, 4.15), (3650, 4.20)],
}
CURVE_SHIFT = {"NGN": 0.25, "GHS": -0.15, "KES": -0.10, "USD": -0.05}  # percentage points per month

head, fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="0B3B4F")


def sheet(ws, header, rows, widths):
    ws.append(header)
    for c in ws[1]:
        c.font, c.fill = head, fill
    for r in rows:
        ws.append(r)
    for col, w in zip("ABCDE", widths):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A2"


wb = Workbook()
fx = wb.active
fx.title = "FX rates"
sheet(fx, ["base", "quote", "rate", "asOfDate"],
      [["USD", ccy, round(rate * (1 + FX_MOVE[ccy]) ** MONTHS_ON, 4), AS_OF] for ccy, rate in FX.items()],
      [10, 10, 12, 14])

yc = wb.create_sheet("Yield curves")
sheet(yc, ["currency", "curveCode", "asOfDate", "tenorDays", "ratePercent"],
      [[c, code, AS_OF, d, round(r + CURVE_SHIFT[c] * MONTHS_ON, 2)] for (c, code), pts in CURVES.items() for d, r in pts],
      [10, 15, 14, 11, 12])

# Policy rates: July's history as text dates, plus the new month(s).
july = load_workbook(GROUP / "market_data_2026-07-31.xlsx", read_only=True)["Policy rates"]
history = [list(r) for r in july.iter_rows(min_row=2, values_only=True) if r and r[0]]
for r in history:
    r[2] = r[2] if isinstance(r[2], str) else r[2].strftime("%Y-%m-%d")
last = {r[0]: r for r in history}  # latest value per series
new_rows = []
for code, (country, step) in {"CBN_MPR": ("NG", 0.0), "BOG_POLICY": ("GH", -0.15), "CBK_CBR": ("KE", -0.10)}.items():
    value = float(last[code][3]) if code in last else 0.0
    for i in range(MONTHS_ON):
        value = round(value + step, 2)
    new_rows.append([code, country, AS_OF, value])
pr = wb.create_sheet("Policy rates")
sheet(pr, ["indicatorCode", "countryCode", "asOfDate", "value"], history + new_rows, [16, 13, 14, 10])

out = GROUP / f"market_data_{AS_OF}.xlsx"
wb.save(out)
print("->", out, "| FX", len(FX), "| curve points", sum(len(p) for p in CURVES.values()), "| policy rows", len(history) + len(new_rows))
