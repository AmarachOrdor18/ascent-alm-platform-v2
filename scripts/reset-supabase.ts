/**
 * Resets the Supabase database to the shipped starting state - the Group organisation only, the shipped
 * roles, users, limits, connectors, default rules and Group market-data source - and clears everything
 * entered since: affiliates, data, runs, approvals, onboarding progress, the audit trail, and any login
 * that is not a seed account.
 *
 *   npx vite-node scripts/reset-supabase.ts --yes            full reset, then re-seed
 *   npx vite-node scripts/reset-supabase.ts --onboarding-only restart organisation onboarding only
 *
 * Runs as the database owner (DATABASE_URL in .env.local), so row-level security does not apply. The
 * audit trail's append-only triggers are switched off only for the duration of the wipe.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { SEED_USERS } from '@/data/seed/bootstrap';

function databaseUrl(): string {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is missing from .env.local');
  return line.slice('DATABASE_URL='.length).trim();
}

// Everything users create. roles and app_users are handled separately; the seed restores the rest.
const WIPE = [
  'run_results', 'runs', 'run_schedules', 'positions', 'batches', 'staged_batches', 'snapshots',
  'balance_history', 'account_history', 'model_runs', 'rule_history', 'rules', 'approvals',
  'remediation_issues', 'notification_rules', 'risk_entries', 'alco_meetings', 'regulatory_returns',
  'report_packs', 'limit_configs', 'temporary_limits', 'breach_notes', 'dimension_members', 'data_sources',
  'fx_rates', 'yield_curves', 'economic_indicators', 'holiday_calendars', 'currencies', 'connectors',
  'onboarding', 'settings', 'affiliates', 'audit_events',
];

async function main() {
  const args = process.argv.slice(2);
  const onboardingOnly = args.includes('--onboarding-only');
  if (!onboardingOnly && !args.includes('--yes')) {
    console.log('This erases every affiliate, upload, run and approval. Re-run with --yes to confirm,');
    console.log('or with --onboarding-only to just restart the organisation onboarding.');
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    if (onboardingOnly) {
      await client.query(`delete from public.onboarding where id = 'ORG'`);
      await client.query('commit');
      console.log('Organisation onboarding restarted - it will show at the next Organisation Admin sign-in.');
      return;
    }
    await client.query('alter table public.audit_events disable trigger user');
    for (const table of WIPE) await client.query(`delete from public.${table}`);
    await client.query('alter table public.audit_events enable trigger user');

    // Logins that are not seed accounts go entirely (their app_users row and their sign-in).
    const seedIds = SEED_USERS.map((u) => u.id);
    const extra = await client.query(`select auth_user_id from public.app_users where id <> all($1::text[])`, [seedIds]);
    await client.query(`delete from public.app_users where id <> all($1::text[])`, [seedIds]);
    for (const row of extra.rows) {
      if (row.auth_user_id) await client.query('delete from auth.users where id = $1', [row.auth_user_id]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    await client.end();
  }

  console.log('Wiped. Re-seeding the shipped starting state…');
  execSync('npx vite-node scripts/seed-supabase.ts --overwrite', { stdio: 'inherit' });
  console.log('Done. Sign in as an Organisation Admin to start the organisation onboarding.');
}

void main();
