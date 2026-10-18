/**
 * Seeds the shared Supabase database with the platform's shipped starting configuration - the same
 * records data/seed/bootstrap.ts writeSeed puts in a fresh local database: the GROUP affiliate, Group
 * dimension members, currencies, roles, limits, connectors, GROUP's market-data sources, default rules and the seeded forecast-scenario
 * approval - and creates a real Supabase sign-in for every seed user (password Ecobank@2026).
 * No demo data (positions, affiliates, market data) is written.
 *
 *   npx vite-node scripts/seed-supabase.ts              add whatever is missing (safe to re-run)
 *   npx vite-node scripts/seed-supabase.ts --overwrite  also reset shipped records to their shipped content
 *
 * Connects as the database owner with DATABASE_URL (from .env.local or the environment), so row-level
 * security does not apply. Never prints the connection string.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { shippedConfiguration } from '@/data/seed/bootstrap';
import { RETIRED_ROLE_MAP } from '@/context/AuthContext';

const SEED_PASSWORD = 'Ecobank@2026';
const overwrite = process.argv.includes('--overwrite');

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
      if (m?.[1]) return m[1].replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error('DATABASE_URL is not set (.env.local or environment)');
}

type Pk = 'id' | 'code';

async function upsertAll(client: pg.Client, table: string, pk: Pk, rows: object[]): Promise<number> {
  let written = 0;
  for (const row of rows) {
    const key = (row as Record<string, unknown>)[pk] as string;
    const sql = overwrite
      ? `insert into public.${table} (${pk}, data) values ($1, $2) on conflict (${pk}) do update set data = excluded.data where public.${table}.data is distinct from excluded.data`
      : `insert into public.${table} (${pk}, data) values ($1, $2) on conflict (${pk}) do nothing`;
    const result = await client.query(sql, [key, JSON.stringify(row)]);
    written += result.rowCount ?? 0;
  }
  return written;
}

async function main() {
  const seed = shippedConfiguration();
  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');

    const counts: Record<string, number> = {};
    counts.affiliates = await upsertAll(client, 'affiliates', 'code', seed.affiliates);
    counts.dimension_members = await upsertAll(client, 'dimension_members', 'id', seed.dimensionMembers);
    counts.currencies = await upsertAll(client, 'currencies', 'code', seed.currencies);
    counts.roles = await upsertAll(client, 'roles', 'code', seed.roles);
    // 8 → 5 roles (same as supabase/migrations/20261019000000_roles_onboarding.sql): move users off the
    // retired roles, then remove the retired role rows. Idempotent.
    for (const [from, to] of Object.entries(RETIRED_ROLE_MAP)) {
      await client.query(
        `update public.app_users set data = jsonb_set(data, '{role}', to_jsonb($2::text)) where data->>'role' = $1`,
        [from, to],
      );
    }
    await client.query('delete from public.roles where code = any($1::text[])', [Object.keys(RETIRED_ROLE_MAP)]);
    counts.limit_configs = await upsertAll(client, 'limit_configs', 'id', seed.limits);
    counts.connectors = await upsertAll(client, 'connectors', 'id', seed.connectors);
    counts.data_sources = await upsertAll(client, 'data_sources', 'id', seed.dataSources);

    // Rules: as upsertRule does, an overwritten rule's previous content is archived to rule_history first.
    if (overwrite) {
      for (const rule of seed.rules) {
        await client.query(
          `insert into public.rule_history (id, data)
           select r.id || ':v' || (r.data->>'version'),
                  jsonb_build_object('id', r.id || ':v' || (r.data->>'version'), 'ruleId', r.id,
                                     'version', (r.data->>'version')::int, 'kind', r.data->>'kind',
                                     'snapshot', r.data, 'archivedAt', to_jsonb(now()))
             from public.rules r where r.id = $1 and r.data is distinct from $2::jsonb
           on conflict (id) do nothing`,
          [rule.id, JSON.stringify(rule)],
        );
      }
    }
    counts.rules = await upsertAll(client, 'rules', 'id', seed.rules);
    counts.approvals = await upsertAll(client, 'approvals', 'id', seed.approvals);

    // Sign-ins: app.create_login writes auth.users + auth.identities + app_users in one go.
    let created = 0;
    for (const user of seed.users) {
      const email = user.email.toLowerCase();
      const exists = await client.query('select 1 from auth.users where lower(email) = $1', [email]);
      if ((exists.rowCount ?? 0) > 0) continue;
      const orphan = await client.query('select 1 from public.app_users where email = $1', [email]);
      if ((orphan.rowCount ?? 0) > 0) {
        console.warn(`  ! ${email}: an app_users row exists without a sign-in - left alone`);
        continue;
      }
      await client.query('select app.create_login($1, $2, $3::jsonb)', [email, SEED_PASSWORD, JSON.stringify(user)]);
      created += 1;
    }
    counts.logins = created;

    // The in-app reset (Admin > Reset platform) restores exactly these rows - keep the record current.
    await client.query('delete from app.seed_rows');
    const snapshot: Array<[string, Pk, object[]]> = [
      ['affiliates', 'code', seed.affiliates],
      ['dimension_members', 'id', seed.dimensionMembers],
      ['currencies', 'code', seed.currencies],
      ['limit_configs', 'id', seed.limits],
      ['connectors', 'id', seed.connectors],
      ['data_sources', 'id', seed.dataSources],
      ['rules', 'id', seed.rules],
      ['approvals', 'id', seed.approvals],
      ['app_users', 'id', seed.users],
    ];
    for (const [table, pk, rows] of snapshot) {
      for (const row of rows) {
        const key = (row as Record<string, unknown>)[pk] as string;
        await client.query('insert into app.seed_rows (tbl, pk, data) values ($1, $2, $3)', [
          table,
          key,
          JSON.stringify(row),
        ]);
      }
    }

    await client.query('commit');
    console.log(`Seed complete${overwrite ? ' (overwrite)' : ''} - rows written:`);
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(18)} ${n}`);
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
