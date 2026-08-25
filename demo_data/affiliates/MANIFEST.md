# Affiliate onboarding datasets

Thirty-three African affiliates, 1583 position records, as at 2026-07-31. One folder per affiliate, holding a position book and a GL trial balance, so every affiliate can be taken through the full onboarding path and reconciled.

```
demo_data/affiliates/
  MANIFEST.md
  Ecobank Nigeria/
      NG_position_book_2026-07.csv
      NG_gl_trial_balance_2026-07.csv
  Ecobank Kenya/
      KE_position_book_2026-07.csv
      KE_gl_trial_balance_2026-07.csv
      KE_validation_failures.csv               <- fails ten ways on purpose
      KE_gl_trial_balance_OUT_OF_BALANCE.csv   <- blocks reconciliation
  ... 31 more
```

Filenames keep their country code even inside a named folder. Onboarding runs through a file picker, and thirty-three files all called `position_book_2026-07.csv` are indistinguishable once they land in a downloads folder.

## Where the structure comes from

`ecobank_ALM/Ultrapay Post Migration.xlsx`, a real core-banking extract. What it dictates here:

| From the extract | How it appears in these files |
|---|---|
| Three-level GL — category / level1 / level2 | `glAccountCode` is the six-digit level-2 code |
| Account numbers embed their GL code | `200601` + `00001` -> `20060100001` |
| `accountoldnumber` survives migration | `legacyAccountNumber` |
| `accountclass` | Customer / Internal / Suspense / Nostro |
| `accountlienamount` | `lienAmount` — an amount, because real liens are partial |
| Monthly credit and debit turnover | `monthlyCredit` / `monthlyDebit`, which drive the activity split |
| Maker, checker, status on every row | `maker` / `checker` / `recordStatus` |

Category mapping from that file: **10 and 20 are assets, 30 is capital, 40 is liabilities**. 50 and 60 are income and expense, which a position book does not carry.

Amounts are in **millions of the affiliate's functional currency**, the convention the Nigeria seed and the original Ghana demo file already use. Every balance sheet balances exactly, with retained earnings as the residual — which is how a trial balance closes.

## The 33

| Folder | Code | Currency | Regulator | Rows | Total assets | NPL | Top depositor |
|---|---|---|---|---|---|---|---|
| `Ecobank Côte d'Ivoire/` | CI | XOF | BCEAO | 49 | 2,567,317 | 3.84% | 3.78% |
| `Ecobank Senegal/` | SN | XOF | BCEAO | 47 | 1,259,167 | 4.79% | 18.94% |
| `Ecobank Mali/` | ML | XOF | BCEAO | 48 | 642,969 | 15.56% | 3.75% |
| `Ecobank Burkina Faso/` | BF | XOF | BCEAO | 48 | 631,612 | 6.15% | 3.42% |
| `Ecobank Benin/` | BJ | XOF | BCEAO | 48 | 518,802 | 5.62% | 3.82% |
| `Ecobank Togo/` | TG | XOF | BCEAO | 48 | 486,712 | 5.65% | 4.34% |
| `Ecobank Niger/` | NE | XOF | BCEAO | 48 | 281,099 | 7.65% | 6.08% |
| `Ecobank Guinea-Bissau/` | GW | XOF | BCEAO | 48 | 88,747 | 5.73% | 3.64% |
| `Ecobank Cameroon/` | CM | XAF | BEAC / COBAC | 48 | 1,132,878 | 4.48% | 4.02% |
| `Ecobank Gabon/` | GA | XAF | BEAC / COBAC | 47 | 505,709 | 5.06% | 18.36% |
| `Ecobank Congo/` | CG | XAF | BEAC / COBAC | 48 | 315,176 | 14.35% | 3.91% |
| `Ecobank Chad/` | TD | XAF | BEAC / COBAC | 48 | 190,592 | 9.89% | 6.19% |
| `Ecobank Centrafrique/` | CF | XAF | BEAC / COBAC | 48 | 77,542 | 4.25% | 3.96% |
| `Ecobank Guinée Équatoriale/` | GQ | XAF | BEAC / COBAC | 48 | 117,521 | 5.31% | 3.52% |
| `Ecobank Nigeria/` | NG | NGN | CBN | 49 | 2,467,347 | 4.69% | 3.76% |
| `Ecobank Ghana/` | GH | GHS | BoG | 47 | 23,848 | 5.18% | 18.97% |
| `Ecobank Guinea/` | GN | GNF | BCRG | 48 | 3,836,841 | 5.55% | 3.50% |
| `Ecobank Sierra Leone/` | SL | SLE | BSL | 48 | 5,317 | 3.95% | 3.72% |
| `Ecobank Liberia/` | LR | LRD | CBL | 48 | 30,721 | 8.67% | 3.33% |
| `Ecobank Gambia/` | GM | GMD | CBG | 48 | 11,533 | 7.87% | 3.56% |
| `Ecobank Cabo Verde/` | CV | CVE | BCV | 48 | 32,910 | 6.72% | 3.73% |
| `Ecobank RD Congo/` | CD | CDF | BCC | 48 | 1,869,007 | 8.23% | 3.29% |
| `Ecobank São Tomé/` | ST | STN | BCSTP | 48 | 2,112 | 4.65% | 3.71% |
| `Ecobank Kenya/` | KE | KES | CBK | 48 | 105,910 | 18.07% | 4.03% |
| `Ecobank Uganda/` | UG | UGX | BoU | 48 | 1,368,095 | 6.84% | 3.76% |
| `Ecobank Tanzania/` | TZ | TZS | BoT | 48 | 767,693 | 7.01% | 3.69% |
| `Ecobank Rwanda/` | RW | RWF | BNR | 48 | 354,161 | 5.71% | 3.88% |
| `Ecobank Burundi/` | BI | BIF | BRB | 48 | 287,259 | 6.75% | 6.08% |
| `Ecobank South Sudan/` | SS | SSP | BoSS | 48 | 88,504 | 19.83% | 6.90% |
| `Ecobank Malawi/` | MW | MWK | RBM | 48 | 471,223 | 6.04% | 3.83% |
| `Ecobank Zambia/` | ZM | ZMW | BoZ | 48 | 13,684 | 5.05% | 4.82% |
| `Ecobank Zimbabwe/` | ZW | USD | RBZ | 48 | 613 | 8.14% | 3.10% |
| `Ecobank Mozambique/` | MZ | MZN | BdM | 48 | 38,132 | 7.25% | 3.21% |

Ethiopia is absent deliberately: it is a representative office, not a banking subsidiary, so it has no balance sheet to onboard.

## Why the currency blocks matter

Eight UEMOA affiliates share the XOF and BCEAO; six CEMAC affiliates share the XAF and BEAC. Nineteen others each run their own currency. That is the case for the Common Chart of Accounts in one table: consolidation has to reconcile thirty-three local charts onto one reporting basis, and eight of them are not even distinguishable by currency.

Zimbabwe reports in USD, so it is the affiliate where the reporting currency and the functional currency coincide — worth having one of those in the set.

## What each one demonstrates

**GW, CF, GQ, GN, SL, GM, CV, ST** — Small balance sheet, full structure. Proves the platform does not assume scale.

**BF, BJ, CM, UG, TZ, RW, MW** — A conventional, reasonably balanced book — the control case.

**SN, GA, GH** — One depositor holds a double-digit share of the funding base — a real single-name breach to resolve.

**ML, CG, KE** — Impaired lending well above the 5% supervisory ceiling, with provisioning that does not fully cover it.

**NE, TD, BI** — Deposit mix skewed to volatile corporate money, so the LCR buffer is thin under stress.

**LR, CD, ZW** — A large share of the book is in foreign currency, so the cross-currency funding mismatch is the risk.

**CI, NG** — Largest books in the Group. Both have issued term paper, so the ladder has a long-dated liability.

**TG, ZM** — Heavy reliance on interbank takings — the first funding to disappear in a market freeze.

**SS** — Stressed on every axis at once: high NPL, volatile funding, thin buffer.

**MZ** — Foreign-currency liabilities fund local-currency lending. Depreciation raises funding cost without raising asset yield.

## Practising the failure path

Both live in `Ecobank Kenya/`.

| File | What it does |
|---|---|
| `KE_validation_failures.csv` | Breaks ten different ways: duplicate key, HQLA with no haircut, maturity before the as-of date, unmapped org unit, missing balance, unknown currency, invalid category, invalid credit classification, lien exceeding the balance |
| `KE_gl_trial_balance_OUT_OF_BALANCE.csv` | Out by 35% on one GL line, so reconciliation blocks sign-off instead of offering a plug to approve |

## Suggested order for a demo

1. **NG** or **CI** — the flagship books, everything populated
2. **SN**, **GA** or **GH** — a single-name depositor breach to find and explain
3. **KE** — impaired lending above the ceiling, then the two broken files above
4. **SS** — stressed on every axis, so the dashboard lights up
5. **ST** or **CF** — the smallest books, proving nothing assumes scale
6. Any two UEMOA affiliates — same currency, same regulator, different local GL

_Generated deterministically; re-running the generator reproduces these files byte for byte, so a diff means a real change._
