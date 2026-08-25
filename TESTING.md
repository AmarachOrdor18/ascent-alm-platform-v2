# Testing what's built

Seven phases are complete — foundation, engine, reference data, onboarding, business rules, execution and results. **44 of 57 screens.** 247 tests.

```bash
npm install
npm run dev          # http://localhost:5173
```

Sign in as any of the six roles. The role changes what you can see and do; that is real, not cosmetic. **Administrator** sees everything.

---

## The five-minute path

If you only do one thing, do this. It exercises the whole spine — data in, rules applied, run executed, results read.

1. **Affiliates** → Nigeria is already loaded and Live.
2. **Process Run** (under Execution) → the form is pre-filled. Press **Execute**.
3. **Dashboard** → nine tiles, all populated, all from that run.
4. Click any tile's **Open detail →**.

That is the loop the whole platform is built around: nothing is displayed that a run did not produce.

---

## 1. The engine — verifiable without opening the app

The engine is gated on reproducing the Ecobank mock workbook exactly. That is the strongest evidence available that the numbers are right, because the workbook was computed independently in Excel.

```bash
npm test              # 247 tests
npm run verify        # typecheck + lint + test — the full gate
```

| Figure | Workbook | Engine |
|---|---|---|
| LCR | 168.857590% | reproduced to 6dp |
| NSFR | 103.631468% | reproduced to 6dp |
| Loan-to-deposit | 78.571429% | reproduced to 6dp |
| NII sensitivity (+200bp) | −8.062891% | reproduced to 6dp |
| EVE sensitivity | −13.809067% | reproduced to 6dp |
| Survival horizon | 17 days | reproduced exactly |

Worth reading rather than only running:

- `src/engine/workbook.test.ts` — the acceptance gate
- `src/engine/repricing.test.ts` — proves repricing is not conflated with maturity, using fixtures the workbook cannot provide
- `src/engine/schedule.test.ts` — recurrence, including why a missed monthly pack does not collapse into one
- `src/engine/ftpAssignment.test.ts` — per-product transfer-pricing methods, and the org-unit attribution bug found in phase 6
- `src/data/seed/seed.test.ts` — catches referential drift before a demo does

---

## 2. Onboarding a new affiliate — `demo_data/`

**These files upload now.** Generated for **Ecobank Ghana**, whose balance sheet is deliberately shaped differently from Nigeria's rather than being a rescaled copy.

| File | What it is |
|---|---|
| `ghana_position_book_2026-07.csv` | The position book, GHS millions. Balances exactly. 37 columns. |
| `ghana_gl_trial_balance_2026-07.csv` | Ledger balances, **420 GHS mm light on assets** |
| `ghana_validation_failures.csv` | Deliberately broken — see below |

### The walkthrough

**Onboard Affiliate** (under Setup) → the wizard runs Identity → Currency → Dimensions → GL mapping → Data → Review. Ghana's local GL scheme is letter-prefixed (`GH-A-100`) and shares nothing with Nigeria's numeric one (`200101`) — that incompatibility is the point, and it is what the Common Chart of Accounts mapping step resolves.

**Data Upload** → drop `ghana_position_book_2026-07.csv`. It stages rather than committing: you see row counts, validation results and a diff before anything lands.

Now upload `ghana_validation_failures.csv` instead. It fails on four distinct things, each reported with its row and reason:

- a duplicate position ID
- an HQLA-flagged asset with no HQLA level
- a maturity date before the as-of date
- an org unit that is not in the dimension

**GL Reconciliation** → load the trial balance. The 420 GHS mm shortfall is inside tolerance, so it produces a **plug entry to approve** rather than a blocked sign-off. Approving it is a maker/checker action and lands in the audit trail.

### What Ghana's book demonstrates

| Finding | Value | Why it is there |
|---|---|---|
| Single depositor concentration | **30.7%** | a real breach to resolve, not a green dashboard |
| NPL ratio | **4.57%** | a live figure — the previous platform returned `null` here |
| Pledged collateral | 900 GHS mm | partial liens, correctly excluded from HQLA |
| Quarterly-repricing loans | 6,800 GHS mm | maturing 2028–29 but repricing October 2026 |

That last row is the one to check on **Maturity & Repricing Gap** — the two ladders diverge, and the screen states the divergence in cash terms.

---

## 3. Configuration — the fourteen rule editors

All under **Business Rules**. Every one shares the same shell: search, create, edit, **Save As**, delete-with-dependency-check, folder and access governance, version bumping.

Three worth opening:

**Time Buckets** — three ladders (liquidity, repricing, IRRBB). Add a bucket, save, then re-run and watch the gap allocation genuinely change. This is the rule that proves the ladder is configuration rather than a hardcoded array.

**Behaviour Patterns** — the core/volatile tiers. Tiers must total 100% and the editor refuses to save otherwise, because Oracle requires it and so does arithmetic.

**Transaction Strategies** — "issue a $200m Eurobond", "sell 30% of the bill portfolio". Decisions rather than shocks. Attach one to a run.

Try deleting a rule that a run consumed — it is blocked, and names what depends on it.

---

## 4. Execution

**Process Run** — compose scope, rules, scenario and calculation elements. If something would make the run fail, it is listed as a blocker *before* you press execute, not reported afterwards. Try setting the reporting currency to one with no FX rate loaded.

**Run History** — set one run as **A**, another as **B**. The comparison colours each move by whether it is an improvement, which depends on the metric: a rising LCR is good, a rising loan-to-deposit is not.

**What-If Builder** — this is the screen that replaces `curl`. v1's Stress Testing screen rendered the literal text *"Custom Scenarios: Via API — POST /stress/run"*. Seven live sliders; the header metrics move as you drag. Start with the **Rate shock + funding stress** preset, then tick **Apply deposit betas** and watch ΔNII improve — a bank with a negative repricing gap genuinely is less exposed once betas apply.

**Batch Scheduler** — create a monthly schedule with a start date a few months back. It immediately shows the **missed occurrences** as a backlog, each runnable separately. They do not collapse into one, because June's ALCO pack is not satisfied by August's. The screen states plainly that a browser cannot fire a timer while the tab is closed.

**Stress Testing** — the six BCBS supervisory shocks with no knobs, the 15% outlier test per shock, and the day-by-day survival timeline.

---

## 5. Results

All ten read from a run and never recompute. Each shows which run, at which date, in which currency, and whether that run's data has since been superseded.

Things to try:

- **Dashboard** → pin a tile with the ★. It moves to the front and survives a refresh.
- **Balance Sheet** → change the roll-up dimension, then expand a row to drill to individual accounts with their lien amounts and credit quality.
- **Liquidity Risk** → contractual and behavioural ladders are shown *side by side*, not as a toggle. v1 had a toggle that rendered identical data in both positions.
- **Funds Transfer Pricing** → expand a row to see the transfer rate decomposed into the curve reading plus each named add-on. Press **Show the N unpriced** — positions with no curve point are reported as unpriced rather than contributing zero margin.
- **Concentration** → Ghana's 30.7% depositor is flagged; the Herfindahl index bands the whole book.
- **FX Position** → net open position per currency against capital.

### The honest-empty test

Go to **Process Run**, deselect most calculation elements, execute, then open a results screen for one you deselected. It tells you the run did not compute that element rather than rendering an empty chart. Deliberate: an empty chart reads as "zero", which is a different claim from "not measured".

---

## 6. Resetting

State lives in IndexedDB under `ascent-alm`. To start clean:

```js
indexedDB.deleteDatabase('ascent-alm'); location.reload();
```

Seeding is idempotent, so a refresh never discards edits — only an explicit reset does.

---

## 7. What is deliberately absent

Not oversights; each is scheduled:

- **Limits, KRIs, remediation, approvals, risk map, notifications** — phase 7 (screens 45–50). Until then the FX screen's 10%/20% supervisory limits are stated as generic footprint conventions rather than limits configured for the affiliate, and it says so on screen.
- **ALCO meetings, regulatory returns, reporting packs, admin** — phase 8 (screens 51–57)
- **Ghana and Côte d'Ivoire pre-seeded** — phase 9. Ghana onboards from the demo files today; it is not in the seed.
- **SSO and Kafka are simulated** — the working implementations live in the v1 microservices repo, which remains the architecture evidence.
- **No scheduler daemon** — a browser-only app cannot fire timers while closed. The recurrence maths is pure and would work unchanged against a scheduler service.
