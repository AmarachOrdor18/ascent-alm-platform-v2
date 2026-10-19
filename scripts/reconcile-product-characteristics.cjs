// One-off data reconciliation (run: node scripts/reconcile-product-characteristics.cjs):
// the approved v3 of RULE-PRODUCTCHARACTERISTIC-GROUP-DEFAULT keyed assumptions to short product codes
// (CASH, TBILL, DDA, LOAN-RET...) that exist nowhere in the onboarded book (codes are derived from the
// product class text via csvImport's productCodeFrom - P-CASH---CENTRAL-BANK-BALANCES ...), so every
// position fell through and LCR/NSFR reported all 15 as "Not classified".
// Rebuilt as v4 using the common-account baseline exactly as the demo's Group_assumptions_setup_values.xlsx
// ships it (COA-11..COA-31, any currency): each upload's common account covers its products whatever the
// bank calls them. v3 is archived to rule_history and the change is recorded with a pre-approved request
// in the same shipped-baseline pattern as the seeded +200bp scenario.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const RULE = 'RULE-PRODUCTCHARACTERISTIC-GROUP-DEFAULT';

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = path.join(__dirname, '..', '.env.local');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  throw new Error('DATABASE_URL is not set (.env.local or environment)');
}

// (coa, role, lcrRate, asf, rsf, hqlaLevel, haircut, duration, rateSensitive) - the workbook's 6 sheet.
const coa = (commonCoaCode, lcrCashflowRole, lcrRatePct, asfFactorPct, rsfFactorPct, hqlaLevel, hqlaHaircutPct, approxDurationYears, isRateSensitive) =>
  ({ productCode: '', commonCoaCode, currency: '*', lcrCashflowRole, lcrRatePct, asfFactorPct, rsfFactorPct, hqlaLevel, hqlaHaircutPct, approxDurationYears, isRateSensitive });

const ASSUMPTIONS = [
  coa('COA-11', 'HQLA', null, null, 0, 'Level 1', 0, null, false),
  coa('COA-12', 'Inflow', 50, null, 15, 'None', 0, null, true),
  coa('COA-13', 'HQLA', null, null, 5, 'Level 1', 0, null, true),
  coa('COA-14', 'Inflow', 50, null, 85, 'None', 0, null, true),
  coa('COA-22', 'Outflow', 10, 90, null, 'None', 0, null, true),
  coa('COA-23', 'Outflow', 100, 100, null, 'None', 0, null, true),
  coa('COA-31', 'None', null, 100, null, 'None', 0, null, false),
];

const client = new Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
(async () => {
  await client.connect();
  try {
    await client.query('begin');
    const now = new Date().toISOString();

    const cur = await client.query('select data from public.rules where id = $1', [RULE]);
    const v3 = cur.rows[0]?.data;
    if (!v3) throw new Error(`${RULE} not found`);
    if (v3.version !== 3) throw new Error(`Expected version 3, found ${v3.version} - nothing to reconcile`);

    // 1. Archive the current state as history, the way the rule editor does on save.
    //    rule_id / version are generated columns - they derive from data.
    await client.query(
      `insert into public.rule_history (id, data, created_at, updated_at, affiliate_code)
       values ($1, $2, now(), now(), null)`,
      [
        `${RULE}:v3`,
        JSON.parse(JSON.stringify({ id: `${RULE}:v3`, kind: v3.kind, ruleId: RULE, version: 3, snapshot: v3, archivedAt: now })),
      ],
    );

    // 2. Save v4 with the common-account baseline.
    const v4 = JSON.parse(JSON.stringify(v3));
    v4.version = 4;
    v4.description =
      "Baseline keyed by the files' common accounts (COA-11..COA-31, any currency): each upload's product family is covered whatever the bank calls its products. Per-product rows are added as products are onboarded.";
    v4.updatedBy = 'system-seed';
    v4.updatedAt = now;
    v4.assumptions = ASSUMPTIONS;
    await client.query('update public.rules set data = $2, updated_at = now() where id = $1', [RULE, v4]);

    // 3. Record the change as a pre-approved request, the shipped-baseline pattern (seed scenario).
    await client.query(
      `insert into public.approvals (id, data, created_at, updated_at) values ($1, $2, now(), now())`,
      [
        `APR-${RULE}-V4`,
        {
          id: `APR-${RULE}-V4`,
          module: 'Business Rules',
          entityType: 'ProductCharacteristic',
          entityId: RULE,
          entityLabel: `${v3.name} (v4)`,
          entityVersion: 4,
          action: 'Update',
          summary: 'Product characteristics re-keyed to the onboarded book: 7 common-account line(s) covering the COA-11..COA-31 families in any currency. Shipped-baseline reconciliation.',
          affiliateCode: null,
          status: 'Approved',
          requestedBy: 'system-seed',
          requestedAt: now,
          decidedBy: 'system-seed',
          decidedAt: now,
          decisionNote: 'Pre-approved reconciliation: the approved v3 keyed factors to product codes that no position carries, leaving every position "Not classified" for LCR/NSFR. Re-keyed to the common accounts the files carry, matching the published demo workbook.',
        },
      ],
    );

    await client.query('commit');
    console.log(`Reconciled: v3 archived to rule_history, rule -> v4 (7 common-account assumptions), request APR-${RULE}-V4 recorded as pre-approved`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
