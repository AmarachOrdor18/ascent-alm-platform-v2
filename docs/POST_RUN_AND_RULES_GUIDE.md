# Onboarding Nigeria & Ghana, Uploading Data, and Editing Business Rules

The full path from an empty platform to two Live affiliates with three months of data each, what to
check once a Process Run completes, and a hands-on walkthrough of editing a Business Rule and
watching a specific number change because of it.

All sample files referenced below live under `sample-data/`:

```
sample-data/
├── nigeria/
│   ├── 2026-06-30/{loans,deposits,treasury}.csv
│   ├── 2026-07-31/{loans,deposits,treasury}.csv
│   └── 2026-08-31/{loans,deposits,treasury}.csv
├── ghana/
│   └── (same structure as nigeria/)
└── reference/
    ├── fx-rates.csv
    ├── indicators-nigeria-inflation.csv
    └── indicators-ghana-inflation.csv
```

---

## Part 1 — Onboard Nigeria and Ghana

Go to **Group & Affiliate Management → Onboard Affiliate**.

### Nigeria

**Step 1 — Legal entity & profile**

| Field | Value |
|---|---|
| Affiliate code | `NG` |
| Legal name | Ecobank Nigeria Limited |
| Country | Nigeria |
| Region | Nigeria |
| Regulator | CBN |
| Legal entity code | `LE-NG` (pre-filled) |

**Step 2 — Currencies & calendar**
- Functional currency: **NGN** (immutable once set)
- Reporting currency: leave as USD
- Fiscal year end: `12-31`
- Holiday calendar: pick Nigeria's if one is already listed, else leave "- none yet -" (Part 3.3
  below covers creating one)
- Other active currencies: check **USD**

**Step 3 — Connectivity & data sources**
For all six domains (Positions, GeneralLedger, MarketRates, FxRates, Counterparties,
EconomicIndicators): set **Fed by = File substitution**, SLA `30` days, Owner `Finance Ops` (any
name works). Simplest path — no connector to configure.

**Step 4 — Chart of accounts & organisation**
Map each Group COA node to a local GL code (type the code, click Add) — every row needs at least
one:

| Group COA node | Local code |
|---|---|
| COA-11 Cash & Balances with Central Banks | `NG-1010` |
| COA-12 Due from Banks | `NG-1015` |
| COA-13 Investment Securities | `NG-1020` |
| COA-14 Loans & Advances to Customers | `NG-1030` |
| COA-15 Property, Equipment & Other Assets | `NG-1090` |
| COA-21 Due to Banks | `NG-2005` |
| COA-22 Customer Deposits | `NG-2010` |
| COA-23 Debt Securities Issued | `NG-2020` |
| COA-24 Other Liabilities & Provisions | `NG-2090` |
| COA-31 Share Capital | `NG-3010` |
| COA-32 Reserves & Retained Earnings | `NG-3020` |

Then click **"Create the standard org-unit template"** — creates `OU-NG`, `OU-NG-RET`, `OU-NG-COR`,
`OU-NG-TSY`, `OU-NG-WLT`.

**Step 5 — Assumption inheritance**: pick "Inherit the Group default rule set," *or*, if you want
Nigeria to have its own rules instead of the Group's: pick **"Fork affiliate-specific rules"**,
optionally clone a starting point (Group default, or another Live affiliate's rules) with **Clone
starter rules**, then click **"Go to Ecobank Nigeria's Business Rules →"** — this is the actual
action point, taking you straight to that affiliate's Rule Coverage registry, where every rule kind
(Product Characteristics, Behaviour Patterns, FTP Rules, etc.) is edited. It's reachable immediately,
not after onboarding finishes.

**Step 6 — Limits & regulatory thresholds**: click "Confirm these thresholds for Ecobank Nigeria"
(CBN's floors are pre-filled and locked).

Click **Submit for approval**. Status becomes Testing, pending an Activate approval.

### Ghana

Same wizard, new affiliate:

**Step 1**: code `GH`, name Ecobank Ghana, country Ghana, region **Anglophone West Africa**,
regulator **Bank of Ghana**, legal entity `LE-GH`.

**Step 2**: functional currency **GHS**, reporting USD, fiscal year end `12-31`, active currency USD.

**Step 3**: same as Nigeria — File substitution for all six domains.

**Step 4**: same 11 COA nodes, `GH-` codes:

| Group COA node | Local code |
|---|---|
| COA-11 | `GH-1010` |
| COA-12 | `GH-1015` |
| COA-13 | `GH-1020` |
| COA-14 | `GH-1030` |
| COA-15 | `GH-1090` |
| COA-21 | `GH-2005` |
| COA-22 | `GH-2010` |
| COA-23 | `GH-2020` |
| COA-24 | `GH-2090` |
| COA-31 | `GH-3010` |
| COA-32 | `GH-3020` |

Then create the standard org-unit template (`OU-GH-RET`, `OU-GH-COR`, `OU-GH-TSY`, `OU-GH-WLT`).

**Steps 5 & 6**: same as Nigeria. Submit for approval.

---

## Part 2 — Approve both to Live

Go to **Controls → Approvals**. Two "Activate" requests are waiting (Nigeria, Ghana). Approve each —
this flips both affiliates from Testing to Live, which is what makes them appear in the Scope
switcher, Run picker, Data Upload, Dimensions, and Counterparty Register (all Live-only).

---

## Part 3 — Uploading the sample data

### 3.1 Position files — full walkthrough for one file

Every one of the 18 position files uploads the same way. Here it is in full for the first one, then
a table for the rest.

1. Go to **Data Management → Data Upload**.
2. In the scope switcher at the top, pick **Ecobank Nigeria**.
3. Set **Domain** to **Positions**.
4. Set **As-of date** to **2026-06-30**.
5. Under **Contributing department**, select **Loans** (this is the *desk* submitting the file, not
   the source system — Loans/Deposits/Treasury each submit their own slice independently).
6. Drag `sample-data/nigeria/2026-06-30/loans.csv` onto the upload area (or click to browse).
7. Check the staging summary:
   - **Rows staged** should read 5, **Parse errors** 0.
   - **Validation** should read **Passed**. If anything shows as unmapped, it means a GL account or
     org unit code in the file doesn't match what you registered in Step 4/3 above — fix the mapping,
     not the file.
8. Click **Commit batch**.

To load a different department or date, change the **Contributing department** and/or **As-of
date** dropdowns and repeat from step 6; affiliate and domain stay selected.

### 3.2 The remaining 17 uploads

| Affiliate | As-of date | Department | File |
|---|---|---|---|
| Nigeria | 2026-06-30 | Deposits | `sample-data/nigeria/2026-06-30/deposits.csv` |
| Nigeria | 2026-06-30 | Treasury | `sample-data/nigeria/2026-06-30/treasury.csv` |
| Nigeria | 2026-07-31 | Loans | `sample-data/nigeria/2026-07-31/loans.csv` |
| Nigeria | 2026-07-31 | Deposits | `sample-data/nigeria/2026-07-31/deposits.csv` |
| Nigeria | 2026-07-31 | Treasury | `sample-data/nigeria/2026-07-31/treasury.csv` |
| Nigeria | 2026-08-31 | Loans | `sample-data/nigeria/2026-08-31/loans.csv` |
| Nigeria | 2026-08-31 | Deposits | `sample-data/nigeria/2026-08-31/deposits.csv` |
| Nigeria | 2026-08-31 | Treasury | `sample-data/nigeria/2026-08-31/treasury.csv` |
| Ghana | 2026-06-30 | Loans | `sample-data/ghana/2026-06-30/loans.csv` |
| Ghana | 2026-06-30 | Deposits | `sample-data/ghana/2026-06-30/deposits.csv` |
| Ghana | 2026-06-30 | Treasury | `sample-data/ghana/2026-06-30/treasury.csv` |
| Ghana | 2026-07-31 | Loans | `sample-data/ghana/2026-07-31/loans.csv` |
| Ghana | 2026-07-31 | Deposits | `sample-data/ghana/2026-07-31/deposits.csv` |
| Ghana | 2026-07-31 | Treasury | `sample-data/ghana/2026-07-31/treasury.csv` |
| Ghana | 2026-08-31 | Loans | `sample-data/ghana/2026-08-31/loans.csv` |
| Ghana | 2026-08-31 | Deposits | `sample-data/ghana/2026-08-31/deposits.csv` |
| Ghana | 2026-08-31 | Treasury | `sample-data/ghana/2026-08-31/treasury.csv` |

Switch scope to **Ecobank Ghana** once, via the scope switcher, before starting the Ghana rows.

**After each date's three uploads are committed**, go to **Data Management → Data Vintages**, expand
that date's Positions batch, and confirm the Position Book readiness indicator shows all three
departments **Submitted** — the book for that date is only complete once Loans, Deposits and
Treasury have all landed.

### 3.3 Reference data — upload where possible, enter manually where not

**FX rates — direct upload.** Go to the Group row's **Settings → Reference Data → Currency & FX
Rates**, use the bulk-upload control, and select `sample-data/reference/fx-rates.csv`. It carries one
NGN and one GHS rate per as-of date (6 rows) — a rate is a dated series, same as a yield curve, so all
three land as separate rows rather than one overwriting the next; a run always converts using whichever
is most recent as of its own date.

**Economic indicators — create the series first, then upload.** Go to **Settings → Reference Data →
Economic Indicators**, click **+ New series**, and create:
- Code `NG-INFL`, name "Nigeria Inflation Rate (YoY)", country `NG`, frequency Monthly, value type
  Percentage, unit `%`
- Code `GH-INFL`, name "Ghana Inflation Rate (YoY)", country `GH`, frequency Monthly, value type
  Percentage, unit `%`

Select each series in turn and upload `sample-data/reference/indicators-nigeria-inflation.csv` /
`sample-data/reference/indicators-ghana-inflation.csv`.

**Yield curves — manual entry, no upload path.** A curve is a dated series too — it's valid for any run
from its own as-of date onward, and each currency can carry several dated versions on file at once (a
run always uses whichever is most recent as of its own date). Go to **Settings → Reference Data →
Interest Rates & Curves**, pick a currency under **"New dated curve for currency,"** set the **As of
date**, click **New curve**, and enter each tenor point. Repeat three times per currency, once per
as-of date — the tool will refuse to save a second curve for the same currency dated identically, so if
you see that, you've already entered that one.

**NGN**

| Tenor | 2026-06-30 | 2026-07-31 | 2026-08-31 |
|---|---|---|---|
| O/N | 28.50% | 27.85% | 27.25% |
| 1M | 28.00% | 27.35% | 26.75% |
| 3M | 26.60% | 26.05% | 25.50% |
| 6M | 25.00% | 24.50% | 24.00% |
| 1Y | 22.90% | 22.45% | 22.00% |
| 3Y | 19.10% | 18.80% | 18.50% |
| 5Y | 16.50% | 16.25% | 16.00% |

**GHS**

| Tenor | 2026-06-30 | 2026-07-31 | 2026-08-31 |
|---|---|---|---|
| O/N | 30.20% | 29.60% | 29.00% |
| 1M | 29.60% | 29.05% | 28.50% |
| 3M | 28.00% | 27.50% | 27.00% |
| 6M | 26.40% | 25.95% | 25.50% |
| 1Y | 23.80% | 23.40% | 23.00% |
| 3Y | 19.50% | 19.25% | 19.00% |
| 5Y | 17.40% | 17.20% | 17.00% |

Both curves ease gradually across the three dates, consistent with the disinflation already in the
economic indicator files (Nigeria 32.5% → 27.6%, Ghana 22.4% → 18.5%) — same underlying story, told
through two different reference-data series.

**Holiday calendars — manual entry.** Go to **Settings → Reference Data → Holiday Calendar**, click
**New calendar**, and create:
- Country `NG`, name "Nigeria", weekend Saturday + Sunday, then add a holiday (e.g. `2026-10-01`
  Independence Day)
- Country `GH`, name "Ghana", weekend Saturday + Sunday, then add a holiday (e.g. `2026-03-06`
  Independence Day)

With all of that in place, both affiliates have everything Process Run needs: committed position
data for three dates, FX conversion, a yield curve for FTP/IRRBB, and a holiday calendar for
business-day bucket placement.

---

## Part 4 — After a Process Run completes

You clicked **Execute run** and it says "Completed." Work through these in order:

### 1. Read the outcome banner first
It gives a contextual **"Review ___ →"** link straight to the module the computed elements feed —
click it rather than navigating manually.

### 2. Check Run History for the full picture
Go to **Execution & Scheduling → Run History**.
- Confirm the run shows **Completed**, not Failed.
- Check the **Elements** column — a failure is per-element, not per-run.
- If a prior run exists for the same affiliate, use the **A/B compare** to see what moved.

### 3. Review the headline risk results, in this order
1. **Liquidity Risk** (LCR, NSFR, Loan-to-Deposit)
2. **IRRBB** (NII/EVE sensitivity, repricing gap)
3. **Concentration & Large Exposures**
4. **Transfer Pricing / Profitability** — only meaningful once an FTP rule is configured (Part 5)
5. **Balance Sheet & Treasury / FX Position**

Check the **"Reading from"** banner on each screen — if it says **"Superseded data"**, a newer
upload has landed since this run executed; re-run before reporting off it.

### 4. Check Monitoring for breaches
**Limits & Breaches** reads **"No data"** rather than a false "Green" when the run didn't compute
the element it needs. Then check **Key Risk Indicators** — this is where the trend across your
three uploaded months shows up (needs at least two runs at different as-of dates to plot anything).

### 5. Reconcile — advisory, not blocking, but don't skip it
**Data Management → GL Reconciliation** never blocks a run or a report, but an unreconciled run is
flagged wherever it's read downstream.

Pick the affiliate and as-of date, then upload the matching trial balance under **"Trial balance
(CSV, Excel, JSON or XML)"**:

| Affiliate | As-of date | File |
|---|---|---|
| Nigeria | 2026-06-30 | `sample-data/nigeria/2026-06-30/gl_ledger.csv` |
| Nigeria | 2026-07-31 | `sample-data/nigeria/2026-07-31/gl_ledger.csv` |
| Nigeria | 2026-08-31 | `sample-data/nigeria/2026-08-31/gl_ledger.csv` |
| Ghana | 2026-06-30 | `sample-data/ghana/2026-06-30/gl_ledger.csv` |
| Ghana | 2026-07-31 | `sample-data/ghana/2026-07-31/gl_ledger.csv` |
| Ghana | 2026-08-31 | `sample-data/ghana/2026-08-31/gl_ledger.csv` |

Each ledger's `endingBalance` per GL account is computed directly from that date's committed Loans +
Deposits + Treasury files, so at the default **GL account** level and tolerances every line reads
**Agrees** and **Sign off period** is immediately available — no plugs needed. To see the plug/approval
flow instead, edit one `endingBalance` in a copy of a ledger file before uploading it; a variance inside
tolerance produces a suggested plug that needs a separate approval before sign-off, and one outside
tolerance blocks it.

### 6. Only then, build reporting output
Report Packs / Regulatory Reporting, pointing at this run. Check the pack/return detail view for the
stale/unreconciled warning banner before distributing or submitting.

### 7. If you want different numbers, don't edit history — run again
Results are immutable once computed. If you tweak a Business Rule (Part 5) and want to see its
effect, execute a **new** run — the old one stays exactly as it was.

---

## Part 5 — Editing a Business Rule and seeing the result change

Worked example using **Product Characteristics**, because it's the rule with the most visible,
concrete effect on a number you can watch change: **NSFR**.

### Why NSFR specifically

NSFR is Available Stable Funding ÷ Required Stable Funding. Both sides are driven entirely by each
position's `asfFactorPct` (liabilities/capital) and `rsfFactorPct` (assets) — see `computeNsfr` in
`src/engine/liquidity.ts:130-145`. None of the sample position files set those columns (they're
genuinely optional), so **every position defaults to 0% ASF/RSF** — NSFR today reads as roughly 0%,
not because the bank is unstable, but because nothing has told the engine what each product actually
is. Product Characteristics is the rule that turns a raw, unclassified upload into a real regulatory
number.

### Step-by-step

**1. Baseline — see the problem first.**
Execute a Process Run for Nigeria at 2026-08-31 (all elements, no rules selected) if you haven't
already. Open **Liquidity Risk** and note the NSFR figure — it will be near zero.

**2. Configure the rule.**
Go to the Group row's **Settings → Business Rules → Product Characteristics**. Create a rule (or
fork the Group default) and add one row per `productCode` your position files use, currency `NGN`:

| Product code | ASF % | RSF % | HQLA level | HQLA haircut % | LCR role |
|---|---|---|---|---|---|
| CASH | – (0) | 0 | Level 1 | 0 | HQLA |
| TBILL | – (0) | 5 | Level 1 | 0 | HQLA |
| INTERBANK | – (0) | 15 | Level 2A | 15 | HQLA |
| FGNBOND | – (0) | 15 | Level 1 | 0 | HQLA |
| LOAN-COR | – (0) | 65 | None | 0 | None |
| LOAN-SME | – (0) | 65 | None | 0 | None |
| LOAN-RET | – (0) | 85 | None | 0 | None |
| DDA | 90 | – (0) | None | 0 | Outflow |
| TD | 50 | – (0) | None | 0 | Outflow |
| CAP | 100 | – (0) | None | 0 | None |

(Repeat for Ghana with currency `GHS` and product codes `BORROW`/`GOGBOND` in place of `FGNBOND` —
same factors, ASF 100% for `BORROW` since it's long-dated term funding.)

Leaving the "irrelevant" side at 0 is harmless — `computeNsfr` only reads `asfFactorPct` on
liabilities/capital and `rsfFactorPct` on assets, so the unused field on any given row is never
consulted.

**3. Re-run, with the rule selected.**
Go to **Process Run**, pick **Custom**, and select your new Product Characteristics rule in the
Rules panel before executing. This produces a **new, separate run** — the baseline run from step 1
is untouched.

**4. Compare.**
Open **Run History**, put the baseline run on one side and the new run on the other, and look at the
NSFR row in the A/B compare. It should move from ~0% to a real, defensible number — entirely because
of the rule, with the same uploaded position data underneath both runs.

**5. Optional — see LCR move too.**
The sample position files already set `lcrcashflowrole`/`hqlalevel` directly on the cash and T-bill
rows, so LCR was already reasonable before this rule. To see LCR move as well, blank those two
columns out of a copy of a Treasury file, re-upload, and repeat the before/after.

### The general pattern, for any other rule

1. Note the current value of whatever the rule affects (Part 4 step 3's per-element note above
   tells you which rule feeds which element).
2. Configure or edit the rule.
3. Execute a **new** Process Run with that rule selected.
4. Compare the new run against the old one in Run History's A/B view — never against the same run,
   since it never recomputes.
