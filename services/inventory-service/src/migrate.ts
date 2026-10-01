/**
 * Applies the hand-written SQL migrations in packages/database/migrations/sql.
 *
 * Those files are additive and idempotent, so re-running is safe. Applied
 * filenames are recorded in `_sql_migrations` to keep the output readable and
 * to make a failure point obvious.
 *
 * Usage (must use the direct/unpooled connection):
 *   DATABASE_URL="$DATABASE_URL_UNPOOLED" bun run db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const migrationsDir = join(import.meta.dir, '../../../packages/database/migrations/sql');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const client = new Client({ connectionString: databaseUrl });

async function main() {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  if (!files.length) {
    console.log(`No SQL migrations found in ${migrationsDir}`);
    return;
  }

  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS _sql_migrations (
      filename   text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query<{ filename: string }>('SELECT filename FROM _sql_migrations')).rows.map(
      (row) => row.filename
    )
  );

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`skip   ${filename} (already applied)`);
      continue;
    }

    const sql = await readFile(join(migrationsDir, filename), 'utf8');
    console.log(`apply  ${filename}`);

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _sql_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`failed ${filename}`);
      throw error;
    }
  }

  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'kind'`
  );
  console.log(`done — inventory_items.kind present: ${rows[0].count === '1'}`);
}

try {
  await main();
} finally {
  await client.end();
}
