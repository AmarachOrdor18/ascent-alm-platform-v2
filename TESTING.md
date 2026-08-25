# Testing what's built

Three phases are complete: the foundation, the calculation engine, and reference data. This is how to exercise each of them, and what is deliberately not there yet.

```bash
npm install
npm run dev          # http://localhost:5173
```

Sign in as any of the six roles. The role you pick changes what you can see and do — that is real, not cosmetic.

---

## 1. The engine — verifiable without opening the app

The engine is gated on reproducing the Ecobank mock workbook exactly. That is the strongest evidence available that the numbers are right, because the workbook was computed independently in Excel.

```bash
npm test                    # 180 tests
npm run test:coverage       # engine coverage, thresholds enforced
```

| Figure | Workbook | Engine |
|---|---|---|
| LCR | 168.857590% | reproduced to 6dp |
| NSFR | 103.631468% | reproduced to 6dp |
| Loan-to-deposit | 78.571429% | reproduced to 6dp |
| NII sensitivity (+200bp) | −8.062891% | reproduced to 6dp |
| EVE sensitivity | −13.809067% | reproduced to 6dp |
| Survival horizon | 17 days | reproduced exactly |

Worth reading rather than just running:

- `src/engine/workbook.test.ts` — the acceptance gate
- `src/engine/repricing.test.ts` — proves repricing is not conflated with maturity, using fixtures the workbook cannot provide
- `src/data/seed/seed.test.ts` — catches referential drift before a demo does

---

## 2. The screens

Sign in as **Administrator** to see everything; the other roles show less by design.

### Dimensions & Hierarchies
Switch between the seven dimensions. Expand **Organisational Unit** and tick *Nigeria* — the whole subtree selects, because picking a rollup has to capture everything under it. Add a member and it persists across a refresh.

### Counterparty Register
Shows each counterparty's actual deposit exposure and share, read from committed positions. With Nigeria in scope nothing breaches; the Ghana file below introduces a depositor at **30.7%**, which trips the concentration warning.

### Interest Rates & Yield Curves
Pick **NGN-NIBOR**: it is inverted, which is the shape Nigeria has actually run, and the header says so. Edit a term point and the chart moves. The **interpolation probe** shows the rate a position repricing in N days would be charged — 197 days lands between the 6M and 1Y points.

### Currency & FX Rates
Edit a rate and tab out; the "units per USD" column recalculates. Expand a row for a worked conversion. **Coverage** reads *Complete* — delete a rate from the store and it names the missing currency, because a Group run would fail rather than quietly drop it.

### Economic Indicators
Six series across three countries. Record an observation for a date that already exists and it *replaces* rather than duplicates — statistical agencies revise.

### Holiday Calendar
The **settlement probe** is the point. Enter `2026-12-25` against the Nigeria calendar: it settles 29 December, because Christmas, Boxing Day and the weekend all intervene. At the short end of a liquidity ladder that moves a flow between buckets.

### Everything else
Navigation lists all 57 screens. Unbuilt ones say so and name the phase that builds them, rather than showing an empty shell that implies they work.

---

## 3. Demo files — `demo_data/`

Generated for onboarding **Ecobank Ghana**, whose balance sheet is deliberately shaped differently from Nigeria's rather than being a rescaled copy.

| File | What it is |
|---|---|
| `ghana_position_book_2026-07.csv` | 21 positions, GHS millions. Balances exactly. |
| `ghana_gl_trial_balance_2026-07.csv` | Ledger balances, **420 GHS mm light on assets** — inside tolerance, so it produces a plug entry to approve rather than a blocked sign-off |
| `ghana_validation_failures.csv` | Deliberately broken: duplicate ID, HQLA with no level, a maturity before the as-of date, an unmapped org unit |

What Ghana's book is built to demonstrate:

| Finding | Value | Why it is there |
|---|---|---|
| Single depositor concentration | **30.7%** | a real breach to resolve, not a green dashboard |
| NPL ratio | **4.57%** | a live figure — the previous platform returned `null` here |
| Pledged collateral | 900 GHS mm | correctly excluded from HQLA; the old engine counted it and overstated LCR |
| Quarterly-repricing loans | 6,800 GHS mm | maturing 2028–29 but repricing October 2026 — the repricing/maturity distinction Nigeria's workbook-faithful seed cannot show |

**These files cannot be uploaded yet.** Data Upload & Staging is screen 6, built in phase 3. Until then they are a specification the engine is already tested against — every field maps to a `Position` field the engine reads today.

---

## 4. Resetting

State lives in IndexedDB under `ascent-alm`. To start clean, clear site data in devtools, or in the console:

```js
indexedDB.deleteDatabase('ascent-alm'); location.reload();
```

Seeding is idempotent, so a refresh never discards edits — only an explicit reset does.

---

## 5. What is deliberately absent

Not oversights; each is scheduled:

- **No data upload** until phase 3 — hence the note on the demo files above
- **No process runs or results screens** until phases 5 and 6, so LCR and NSFR are not yet displayed anywhere despite being computed and tested
- **No limits, KRIs or remediation** until phase 7
- **No reporting or admin** until phase 8
- **SSO and Kafka are simulated** — the working implementations live in the v1 microservices repo, which remains the architecture evidence
