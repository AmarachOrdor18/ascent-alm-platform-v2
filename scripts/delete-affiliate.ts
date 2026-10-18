/**
 * Deletes one affiliate and everything that belongs to it - its data sources, uploads, positions, runs,
 * rules, approvals, onboarding progress, settings, dimension members and the logins scoped to it. The
 * audit trail is append-only and keeps its entries.
 *
 *   npx vite-node scripts/delete-affiliate.ts GH            shows what would be deleted
 *   npx vite-node scripts/delete-affiliate.ts GH --yes      deletes it
 *
 * Runs as the database owner (DATABASE_URL in .env.local).
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const TABLES_BY_AFFILIATE = [
  'run_results', 'runs', 'run_schedules', 'positions', 'batches', 'staged_batches', 'snapshots',
  'balance_history', 'account_history', 'model_runs', 'rule_history', 'rules', 'approvals',
  'remediation_issues', 'notification_rules', 'risk_entries', 'alco_meetings', 'regulatory_returns',
  'report_packs', 'limit_configs', 'temporary_limits', 'breach_notes', 'dimension_members', 'data_sources',
  'onboarding', 'settings',
];

function databaseUrl(): string {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is missing from .env.local');
  return line.slice('DATABASE_URL='.length).trim();
}

async function main() {
  const code = (process.argv[2] ?? '').toUpperCase();
  const confirmed = process.argv.includes('--yes');
  if (!code || code === 'GROUP') throw new Error('Give an affiliate code, e.g. GH (the Group itself cannot be deleted).');

  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const aff = await client.query(`select data->>'name' as name from public.affiliates where code = $1`, [code]);
    if (aff.rowCount === 0) {
      console.log(`No affiliate with code ${code}.`);
      return;
    }
    console.log(`Affiliate ${code} - ${aff.rows[0].name}`);
    const counts: Record<string, number> = {};
    for (const t of TABLES_BY_AFFILIATE) {
      const r = await client.query(`select count(*)::int n from public.${t} where affiliate_code = $1`, [code]);
      if (r.rows[0].n > 0) counts[t] = r.rows[0].n;
    }
    const users = await client.query(`select id, auth_user_id, data->>'email' as email from public.app_users where affiliate_code = $1`, [code]);
    console.log('Rows:', counts, '| Logins:', users.rows.map((u) => u.email));
    if (!confirmed) {
      console.log('Nothing deleted. Re-run with --yes to delete.');
      return;
    }

    await client.query('begin');
    for (const t of TABLES_BY_AFFILIATE) await client.query(`delete from public.${t} where affiliate_code = $1`, [code]);
    await client.query(`delete from public.app_users where affiliate_code = $1`, [code]);
    for (const u of users.rows) if (u.auth_user_id) await client.query('delete from auth.users where id = $1', [u.auth_user_id]);
    await client.query('delete from public.affiliates where code = $1', [code]);
    await client.query('commit');
    console.log(`Deleted affiliate ${code}.`);
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

void main();
