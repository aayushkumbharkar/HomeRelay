import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const household = 'demo-home';
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function openDb(url: string) {
  if (!url) throw new Error('DATABASE_URL is required');
  return new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000,
    statement_timeout: 5000, lock_timeout: 5000, max: 12 });
}
export async function transaction<T>(pool: pg.Pool, work: (db: pg.PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
export const migrations = ['db/001-core.sql', 'db/002-preflight-runs.sql'];
export const schemaVersion = migrations.length;
export async function migrate(pool: pg.Pool, target = schemaVersion) {
  const files = await Promise.all(migrations.slice(0, target).map(file => readFile(file, 'utf8')));
  await transaction(pool, async db => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('homerelay-migration'))");
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL)');
    for (const [index, sql] of files.entries()) {
      const version = index + 1;
      const existing = await db.query('SELECT checksum FROM schema_migrations WHERE version = $1', [version]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== hash(sql)) throw new Error('Applied migration checksum mismatch');
        continue;
      }
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations VALUES ($1, $2)', [version, hash(sql)]);
    }
  });
}
