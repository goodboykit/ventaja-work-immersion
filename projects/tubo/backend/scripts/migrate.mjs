// Applies every SQL file in supabase/migrations that has not been applied yet.
// Each file runs in ONE transaction: it fully succeeds or nothing changes.
// Use --mark-applied to record files that were already run by hand, without executing them.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

function loadEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

const env = loadEnvFile(".env");
const connectionString = env.DIRECT_URL || env.DATABASE_URL;

if (!connectionString) {
  console.error("No DIRECT_URL or DATABASE_URL found in .env");
  process.exit(1);
}
if (connectionString.includes("[YOUR-PASSWORD]") || connectionString.includes("[PASSWORD]")) {
  console.error("The database URL in .env still contains the password placeholder.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
// RLS on with no policies: hidden from the public API; this script's direct connection is unaffected.
await client.query("alter table schema_migrations enable row level security");

const applied = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip   ${file} (already applied)`);
    continue;
  }
  if (process.argv.includes("--mark-applied")) {
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    console.log(`marked ${file} as applied (not executed)`);
    continue;
  }
  try {
    await client.query("begin");
    await client.query(readFileSync(join("supabase/migrations", file), "utf8"));
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`applied ${file}`);
  } catch (error) {
    await client.query("rollback");
    console.error(`FAILED ${file}: ${error.message}`);
    process.exitCode = 1;
    break;
  }
}

await client.end();
