# Affiliate onboarding datasets

Thirty-three African affiliates, 1550 position records, as at 2026-07-31. One folder per affiliate, holding a position book and a GL trial balance, so every affiliate can be taken through the full onboarding path and reconciled.

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
| `Ecobank Côte d'Ivoire/` | CI | XOF | BCEAO | 48 | 2,563,696 | 3.84% | 3.78% |
| `Ecobank Senegal/` | SN | XOF | BCEAO | 46 | 1,261,421 | 4.79% | 19.04% |
| `Ecobank Mali/` | ML | XOF | BCEAO | 47 | 644,020 | 15.56% | 3.75% |
| `Ecobank Burkina Faso/` | BF | XOF | BCEAO | 47 | 629,575 | 6.15% | 3.97% |
| `Ecobank Benin/` | BJ | XOF | BCEAO | 47 | 519,366 | 5.62% | 3.67% |
| `Ecobank Togo/` | TG | XOF | BCEAO | 47 | 487,888 | 5.65% | 4.64% |
| `Ecobank Niger/` | NE | XOF | BCEAO | 47 | 281,006 | 7.65% | 6.08% |
| `Ecobank Guinea-Bissau/` | GW | XOF | BCEAO | 47 | 88,521 | 5.73% | 3.97% |
| `Ecobank Cameroon/` | CM | XAF | BEAC / COBAC | 47 | 1,132,848 | 4.48% | 4.02% |
| `Ecobank Gabon/` | GA | XAF | BEAC / COBAC | 46 | 500,507 | 5.06% | 18.36% |
| `Ecobank Congo/` | CG | XAF | BEAC / COBAC | 47 | 312,835 | 14.35% | 3.61% |
| `Ecobank Chad/` | TD | XAF | BEAC / COBAC | 47 | 189,574 | 9.89% | 6.14% |
| `Ecobank Centrafrique/` | CF | XAF | BEAC / COBAC | 47 | 77,021 | 4.25% | 4.01% |
| `Ecobank Guinée Équatoriale/` | GQ | XAF | BEAC / COBAC | 47 | 117,682 | 5.31% | 3.52% |
| `Ecobank Nigeria/` | NG | NGN | CBN | 48 | 2,466,924 | 4.69% | 3.76% |
| `Ecobank Ghana/` | GH | GHS | BoG | 46 | 23,866 | 5.18% | 17.59% |
| `Ecobank Guinea/` | GN | GNF | BCRG | 47 | 3,853,502 | 5.55% | 4.08% |
| `Ecobank Sierra Leone/` | SL | SLE | BSL | 47 | 5,337 | 3.95% | 3.72% |
| `Ecobank Liberia/` | LR | LRD | CBL | 47 | 30,726 | 8.67% | 3.28% |
| `Ecobank Gambia/` | GM | GMD | CBG | 47 | 11,605 | 7.87% | 3.71% |
| `Ecobank Cabo Verde/` | CV | CVE | BCV | 47 | 32,977 | 6.72% | 3.55% |
| `Ecobank RD Congo/` | CD | CDF | BCC | 47 | 1,874,789 | 8.23% | 3.29% |
| `Ecobank São Tomé/` | ST | STN | BCSTP | 47 | 2,111 | 4.65% | 4.04% |
| `Ecobank Kenya/` | KE | KES | CBK | 47 | 105,465 | 18.07% | 3.88% |
| `Ecobank Uganda/` | UG | UGX | BoU | 47 | 1,371,316 | 6.84% | 3.76% |
| `Ecobank Tanzania/` | TZ | TZS | BoT | 47 | 767,716 | 7.01% | 3.61% |
| `Ecobank Rwanda/` | RW | RWF | BNR | 47 | 354,637 | 5.71% | 3.88% |
| `Ecobank Burundi/` | BI | BIF | BRB | 47 | 287,198 | 6.75% | 6.10% |
| `Ecobank South Sudan/` | SS | SSP | BoSS | 47 | 88,483 | 19.83% | 6.90% |
| `Ecobank Malawi/` | MW | MWK | RBM | 47 | 467,825 | 6.04% | 3.83% |
| `Ecobank Zambia/` | ZM | ZMW | BoZ | 47 | 13,740 | 5.05% | 4.55% |
| `Ecobank Zimbabwe/` | ZW | USD | RBZ | 47 | 614 | 8.14% | 2.80% |
| `Ecobank Mozambique/` | MZ | MZN | BdM | 47 | 38,058 | 7.25% | 3.21% |

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
