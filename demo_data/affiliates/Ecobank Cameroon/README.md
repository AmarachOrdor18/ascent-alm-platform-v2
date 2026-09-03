# Onboarding Ecobank Cameroon — granular test script

## Before you start — how this differs from the Kenya walkthrough

Unlike Ecobank Kenya, **Cameroon has no pre-seeded `Affiliate` record** — it won't appear in the
Affiliates table until you create it via **Affiliates → Onboard affiliate** (`/affiliates/onboard`,
not a `/affiliates/onboard/:code` resume link). This is the true "start from nothing" path
through Step 1, rather than resuming a half-filled wizard.

However, a *separate* bulk seed (`affiliateReference.ts`) already populates reference data for
every one of the Group's 33 African markets, Cameroon included, regardless of whether that
market has been onboarded yet. Before you type anything into the wizard, Cameroon already has:

- **Currency `XAF`** and its **FX rate to USD** (unlike Kenya's `KES`, which was deliberately left
  rate-less as part of the onboarding demo — Cameroon has no such gap).
- **Legal entity `LE-CM`**.
- **Org units** `OU-CM` (root), `OU-CM-TSY`, `OU-CM-CIB`, `OU-CM-RTL` — already present, so Step 4
  does **not** need the "Create the standard org-unit template" button. (That button produces a
  *different* naming scheme — `OU-CM-RET`/`-COR`/`-WLT` — which would just create a second,
  overlapping set of org units alongside the ones already there. Skip the button for Cameroon.)
- **~147 counterparty codes** scoped to CM (`CP-SOVEREIGN`, `CP-CORRESPONDENT-01`,
  `CP-INTERBANK-01`, `CP-DFI-01`, `CP-CORP-ISSUER-01`, `CP-CIB-001..070`, `CP-RTL-001..070`).

What's still genuinely empty for Cameroon — same as Kenya — is the affiliate profile itself,
its feeds, its GL chart/COA mapping, its thresholds, and its positions.

The three position CSVs in this folder (`CM_positions_LOANS_2026-07-31.csv`,
`..._DEPOSITS_...`, `..._TREASURY_...`) partition the same 47-row book as the existing
`CM_position_book_2026-07.csv` (18 + 16 + 13 = 47, same amounts, same GL codes, same org units —
nothing invented) into the three department uploads the real upload flow requires. As with
Kenya, don't upload `CM_position_book_2026-07.csv` directly — the department picker will refuse
it — and every row leaves `commonCoaCode` blank and drops the HQLA/LCR/ASF-RSF/IRRBB columns,
for the same reasons documented in the Kenya README.

## Step 1 — Legal entity & profile (enter from scratch)

| Field | Value |
|---|---|
| Affiliate code | `CM` |
| Legal name | `Ecobank Cameroon` |
| Country | `Cameroon` |
| Region | `Central Africa` |
| Regulator | `BEAC` |
| Functional currency | `XAF` (already exists in the currency list — confirm it shows up correctly with symbol `FCFA`) |

The record auto-creates the moment code + name + country are valid. Confirm Step 1's checkmark
turns on.

## Step 2 — Currencies & calendar

- **Functional currency**: `XAF`.
- **Reporting currency**: `USD`.
- **Fiscal year end**: `12-31`.
- **Holiday calendar**: leave unset — same limitation as Kenya, no calendar-creation control
  exists in the UI yet.
- Confirm the step's checkmark turns on.

## Step 3 — Connectivity & data sources

Same as Kenya: set every domain (Positions, GeneralLedger, MarketRates, FxRates, Counterparties,
EconomicIndicators) to **File** mode, with an SLA and Owner. Confirm the feed status badge
reflects "File" correctly.

## Step 4 — Chart of accounts & organisation

**4a. Org units** — nothing to do. `OU-CM` already exists (pre-seeded), so `orgRootExists` is
already true. Confirm the wizard reflects this (don't click "Create the standard org-unit
template" — see the note above on why that would just create a redundant, differently-named set).

**4b. COA mapping** — genuinely empty, same as Kenya; the general ledger is deliberately not
seeded ("different chart, different scheme" per affiliate). Add every local GL code used across
the three position files:

| Common COA leaf | Local GL codes to add |
|---|---|
| COA-11 — Cash & Balances with Central Banks | 200101, 200102, 200103, 200104 |
| COA-12 — Due from Banks | 200301, 200401 |
| COA-13 — Investment Securities | 200501, 200502, 200503, 200802 |
| COA-14 — Loans & Advances to Customers | 200601, 200602, 200603, 200604, 200605, 200606, 200607, 200608, 200609 |
| COA-15 — Property, Equipment & Other Assets | 100101, 101201 |
| COA-21 — Due to Banks | 400301, 400302 |
| COA-22 — Customer Deposits | 400101, 400102, 400103, 400104, 400105, 400106, 400107 |
| COA-24 — Other Liabilities & Provisions | 400202, 400401, 400402 |
| COA-31 — Share Capital | 300101 |
| COA-32 — Reserves & Retained Earnings | 300201 |

Once every leaf has at least one mapped code, "Unmapped COA" reads 0 and Step 4's checkmark
turns on.

## Step 5 — Assumption inheritance

Same as Kenya — pick **"Inherit the Group default rule set"** for a first pass.

## Step 6 — Limits & regulatory thresholds

BEAC has no explicit entry in `REGULATORY_MINIMA` (only CBN, Bank of Ghana, BCEAO and Central
Bank of Kenya do) — the wizard falls back to the generic default of `{ lcrPercent: 100,
nsfrPercent: 100 }` rather than erroring or showing an empty table. Worth confirming that
fallback renders correctly rather than assuming it's a bug if the table looks the same as
Kenya's.

| Metric | Regulatory minimum (fallback default) | Suggested internal amber | Suggested internal red |
|---|---|---|---|
| LCR | 100% | 115% | 105% |
| NSFR | 100% | 110% | 103% |

Try an invalid pair first (amber below red) to confirm validation fires, then confirm the valid
values and click **"Confirm these thresholds for Ecobank Cameroon."**

## Step 7 — Initial data load

Set **As-of date** to `2026-07-31` (matches the ledger file).

### 7a. Position book — three independent uploads

1. Department = **Treasury** → upload `CM_positions_TREASURY_2026-07-31.csv` (18 rows). Commit.
2. Department = **Loans** → upload `CM_positions_LOANS_2026-07-31.csv` (16 rows). Commit.
3. Department = **Deposits** → upload `CM_positions_DEPOSITS_2026-07-31.csv` (13 rows). Commit.
4. Check **Position Book**, filtered to CM / 2026-07-31 — all 47 rows should appear as one
   assembled book from 3 distinct batches.

### 7b. GL reconciliation

Upload the existing `CM_gl_trial_balance_2026-07.csv` — it already reconciles to the same
47-row total. Confirm currency match (XAF/XAF), variance ~0, sign off.

### 7c. Counterparties (optional)

Cameroon's counterparty dimension is already fully populated from the bulk seed, so there's
nothing new to test here unless you want to exercise the register-upload path with a fresh code
not already in the pre-seeded pool.

## Submit for approval → Approvals → Live

Same as Kenya: with all 7 steps checked, **Submit for approval** flips status to `Testing` and
raises an Activate request; approve it in **Approvals** to flip `Testing → Live`.

## Cleanup note

Unlike Kenya, Cameroon's FX rate is already seeded — no follow-up FX entry needed before running
it through Process Run.

## Files in this folder

| File | Use |
|---|---|
| `CM_positions_TREASURY_2026-07-31.csv` | Step 7a, Treasury department upload (18 rows) |
| `CM_positions_LOANS_2026-07-31.csv` | Step 7a, Loans department upload (16 rows) |
| `CM_positions_DEPOSITS_2026-07-31.csv` | Step 7a, Deposits department upload (13 rows) |
| `CM_gl_trial_balance_2026-07.csv` | Step 7b, reconciliation (already reconciles to the 47 rows above) |
| `CM_position_book_2026-07.csv` | Reference only — the old consolidated file. Do not upload directly. |
