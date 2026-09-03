# Onboarding Ecobank Kenya — granular test script

## Before you start

1. **This affiliate already exists.** Code `KE`, status `Onboarding`, profile fields (country,
   region, regulator, functional/reporting currency) already seeded. This is not a "create a new
   affiliate" test — it's "resume the onboarding wizard for KE and finish it." Go to
   **Affiliates**, find "Ecobank Kenya" (amber `Onboarding` badge), click it. That routes to
   `/affiliates/onboard/KE` and resumes the wizard on Step 1.

2. **Positions upload is per department, not one file.** The upload widget requires picking a
   **Contributing department** (Loans / Deposits / Treasury) before the file input even unlocks,
   and each upload becomes its own independently-committed batch. The three CSVs in this folder
   (`KE_positions_LOANS_2026-07-31.csv`, `..._DEPOSITS_...`, `..._TREASURY_...`) are a straight
   partition of the older `KE_position_book_2026-07.csv` — same 47 rows, same amounts, same GL
   codes, just correctly attributed by department (18 + 16 + 13 = 47). Do **not** upload
   `KE_position_book_2026-07.csv` directly — the department picker will refuse it.

3. **`commonCoaCode` is intentionally blank on every row.** For a brand-new affiliate, the
   Common-COA-mapping check on upload can never be satisfied any other way (Step 4's mapping tool
   writes the mapping onto the *local GL account's* record, not onto a KE-scoped Common-COA
   record) — a non-blank `commonCoaCode` would permanently block commit. The HQLA/LCR/ASF-RSF/
   IRRBB columns are dropped for the same reason your own upload templates drop them:
   `engine/classification.ts` derives those at run time from `productClass` + currency + the
   Models & Assumptions rules, so a department analyst never types them in.

4. **The GL ledger file needs no changes.** `KE_gl_trial_balance_2026-07.csv` already reconciles
   against the same 47-row total, so it's used as-is in Step 7's reconciliation sub-step.

## Step 1 — Legal entity & profile (verify, don't re-enter)

Confirm pre-filled values: Affiliate code `KE`, Legal name `Ecobank Kenya`, Country `Kenya`,
Region `East Africa`, Regulator `Central Bank of Kenya`, Legal entity code `LE-KE`. Touch the
Legal name field and retype the same text to confirm auto-save doesn't error. Step 1's checkmark
should already show complete.

## Step 2 — Currencies & calendar

- **Functional currency**: `KES`, immutable/greyed out.
- **Reporting currency**: `USD`.
- **Fiscal year end**: `12-31`.
- **Holiday calendar**: leave unset. There's currently no Kenya-specific calendar, and this
  screen only *picks* an existing one — the Holiday Calendar page can add exception dates to a
  calendar but has no "create new calendar" control. Leaving it unset doesn't block completion.
- **Other active currencies**: tick `USD` if not already ticked.
- Confirm the step's checkmark turns on.

## Step 3 — Connectivity & data sources

For each of the 6 domains (Positions, GeneralLedger, MarketRates, FxRates, Counterparties,
EconomicIndicators):

1. Set mode to **File** — nothing is integrated for a freshly onboarded affiliate.
2. Set an SLA (e.g. `1` day) and an Owner.
3. Confirm the feed status badge reflects "File" mode correctly, not a false "Connected."

Once every domain has mode = File (or a Connector with a real `connectorId`), Step 3's checkmark
turns on.

## Step 4 — Chart of accounts & organisation

**4a. Org units** — click **"Create the standard org-unit template."** This creates `OU-KE`
(root) plus four leaf segments: `OU-KE-RET` (Retail Banking), `OU-KE-COR` (Corporate &
Investment Banking), `OU-KE-TSY` (Treasury), `OU-KE-WLT` (Wealth Management). The three position
CSVs use exactly these codes, so nothing shows as an unmapped org unit in Step 7.

**4b. COA mapping** — for every Common COA leaf, add each local GL code (type the code into the
input next to that leaf, click **Add**). This is every GL code used across the three position
files — mapping all of them now means zero "unmapped GL" surprises in Step 7:

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

34 "Add" clicks. Once every leaf shows at least one mapped code, "Unmapped COA" reads 0 and
Step 4's checkmark turns on.

## Step 5 — Assumption inheritance

Pick either radio — for a first pass, choose **"Inherit the Group default rule set."** This step
is always complete regardless of choice; confirm the radio state persists on reload.

## Step 6 — Limits & regulatory thresholds

Central Bank of Kenya's minima table has exactly two rows (no `loanToDepositPercent` — that
metric is CBN/Nigeria-only):

| Metric | Regulatory minimum (locked) | Suggested internal amber | Suggested internal red |
|---|---|---|---|
| LCR | 100% | 115% | 105% |
| NSFR | 100% | 110% | 103% |

First try an invalid pair (e.g. amber 90 / red 95) and confirm the validation error fires (red
must be ≥ 100, amber must be ≥ red). Then enter the valid values above and click **"Confirm
these thresholds for Ecobank Kenya."** Step 6's checkmark turns on.

## Step 7 — Initial data load

Set **As-of date** to `2026-07-31` (matches the ledger file).

### 7a. Position book — three independent uploads

1. Contributing department = **Treasury** → upload `KE_positions_TREASURY_2026-07-31.csv`.
   Confirm: 18 rows staged, the balance summary says *"This is Treasury's contribution only...
   not expected to balance on its own,"* no unmapped-code warnings. Click **Commit batch**.
2. Department = **Loans** → upload `KE_positions_LOANS_2026-07-31.csv` (16 rows). Commit.
3. Department = **Deposits** → upload `KE_positions_DEPOSITS_2026-07-31.csv` (13 rows). Commit.
4. Check **Position Book**, filtered to KE / 2026-07-31 — all 47 rows should appear as one
   assembled book sourced from 3 distinct batches.

Note: the wizard's own completion gate (`complete7`) only requires *one* committed Positions
batch plus reconciliation sign-off, not all three departments — worth explicitly confirming
Step 7 goes checkable after just the first commit, then continuing to submit all three anyway
for a realistic, complete scenario.

### 7b. GL reconciliation

Upload `KE_gl_trial_balance_2026-07.csv`. Confirm currency match (KES/KES), variance ~0, "Can
sign off" = yes. Click **Sign off reconciliation**.

### 7c. Negative-path bonus tests (existing fixtures, no new files needed)

- Re-open the reconciliation upload and try `KE_gl_trial_balance_OUT_OF_BALANCE.csv` instead —
  confirm variance is now non-zero and sign-off is blocked/warned.
- Try uploading `KE_validation_failures.csv` as a Positions file (any department) — confirm the
  Validation Exceptions panel lists real failures and "Commit batch" is disabled when severity is
  blocking.

### 7d. Counterparties (optional)

Upload `demo_data/manual_upload/counterparties_register.csv` to exercise that path too — it's
optional for `complete7`.

## Submit for approval

With all 7 steps checked, **"Submit for approval"** becomes enabled. Confirm: affiliate status
flips to `Testing`, an `ApprovalRequest` (module `Affiliates`, action `Activate`) is raised, and
the "✓ Ecobank Kenya submitted for approval" confirmation screen appears with a "View in
Approvals" link.

## Approvals → Live

In **Approvals**, find the Activate request for Ecobank Kenya and approve it (as a different
checker user if your setup enforces maker-checker separation). Confirm status flips
`Testing → Live` and the badge tone changes accordingly.

## Loose end worth doing right after

`FxRates.tsx` has no KES rate seeded on purpose — add one (KES per USD) so Balance Sheet /
Liquidity Risk results show real converted figures for KE once it's Live and run through Process
Run.

## Files in this folder

| File | Use |
|---|---|
| `KE_positions_TREASURY_2026-07-31.csv` | Step 7a, Treasury department upload (18 rows) |
| `KE_positions_LOANS_2026-07-31.csv` | Step 7a, Loans department upload (16 rows) |
| `KE_positions_DEPOSITS_2026-07-31.csv` | Step 7a, Deposits department upload (13 rows) |
| `KE_gl_trial_balance_2026-07.csv` | Step 7b, reconciliation (already reconciles to the 47 rows above) |
| `KE_gl_trial_balance_OUT_OF_BALANCE.csv` | Step 7c, negative-path reconciliation test |
| `KE_validation_failures.csv` | Step 7c, negative-path validation test |
| `KE_position_book_2026-07.csv` | Reference only — the old consolidated file. Do not upload directly. |
