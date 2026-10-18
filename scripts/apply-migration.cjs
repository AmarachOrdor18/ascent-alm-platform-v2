// Applies one SQL migration file to the Supabase database in a single transaction, as the owner.
//   node scripts/apply-migration.cjs supabase/migrations/<file>.sql
// Reads DATABASE_URL from .env.local (git-ignored) or the environment; never prints it.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = path.join(__dirname, '..', '.env.local');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  throw new Error('DATABASE_URL is not set (.env.local or environment)');
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/apply-migration.cjs <migration.sql>');
  const sql = fs.readFileSync(file, 'utf8');
  const client = new Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log(`Applied ${path.basename(file)}`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
