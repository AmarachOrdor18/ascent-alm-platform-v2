"""Builds Ghana and Kenya behavioural-history test files (24 months) from the Nigeria ones: same
segments and shape, converted to local currency, with country-specific rate levels and some noise so
each affiliate fits to different parameters."""
import csv
import random
from pathlib import Path

BASE = Path(r"C:\Users\AmarachiOrdor\Documents\Consulting Demo\test-files")
SRC = BASE / "2_Nigeria_NG"
TARGETS = {
    # code, folder, currency, NGN->local divisor, deposit-rate multiplier, account-count divisor, seed
    "GH": ("3_Ghana_GH", "GHS", 1550 / 15.20, 1.45, 3, 11),
    "KE": ("4_Kenya_KE", "KES", 1550 / 129.40, 2.10, 4, 23),
}

for code, (folder, ccy, divisor, rate_mult, count_div, seed) in TARGETS.items():
    rnd = random.Random(seed)
    out = BASE / folder

    with open(SRC / "balance-history.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    drift = {}
    with open(out / "balance-history.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            key = (r["productCode"], r["customerType"])
            drift[key] = drift.get(key, 1.0) * (1 + rnd.uniform(-0.012, 0.014))
            r = dict(r, affiliateCode=code, currency=ccy)
            r["balance"] = str(round(float(r["balance"]) / divisor * drift[key]))
            if r["ratePercent"]:
                r["ratePercent"] = f"{float(r['ratePercent']) * rate_mult + rnd.uniform(-0.02, 0.02):.3f}"
            if r["accountCount"]:
                r["accountCount"] = str(max(1, round(int(r["accountCount"]) / count_div)))
            w.writerow(r)

    with open(SRC / "account-history.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    with open(out / "account-history.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            r = dict(r, affiliateCode=code, currency=ccy, accountNumber=r["accountNumber"].replace("NG-", f"{code}-", 1))
            for col in ("balance", "scheduledBalance"):
                if r[col]:
                    r[col] = str(round(float(r[col]) / divisor * rnd.uniform(0.97, 1.03)))
            w.writerow(r)
    print(code, "->", out)

readme = BASE / "README.txt"
text = readme.read_text(encoding="utf-8")
text = text.replace(
    "3_Ghana_GH           loans/deposits/treasury (Positions), gl_ledger (General ledger).\n",
    "3_Ghana_GH           loans/deposits/treasury (Positions), gl_ledger (General ledger),\n"
    "                     balance-history + account-history (behavioural models, optional).\n",
).replace(
    "4_Kenya_KE           loans/deposits/treasury (Positions), gl_ledger (General ledger).\n",
    "4_Kenya_KE           loans/deposits/treasury (Positions), gl_ledger (General ledger),\n"
    "                     balance-history + account-history (behavioural models, optional).\n",
).replace("Behavioural-model history is supplied for Nigeria only.\n", "Behavioural-model history (24 months) is supplied for all three affiliates.\n")
readme.write_text(text, encoding="utf-8")
