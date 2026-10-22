import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { openDb, migrate } from '../../src/db.js';
import { seed } from '../../src/fixtures.js';

export async function testDatabase() {
  if (!process.env.TEST_DATABASE_URL) loadEnvFile('.env');
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || !new URL(raw).pathname.endsWith('_test')) throw new Error('Explicit TEST_DATABASE_URL ending in _test is required');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = openDb(raw);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(raw); url.searchParams.set('options', `-c search_path=${schema}`);
  const pool = openDb(url.toString());
  await migrate(pool); await seed(pool);
  return { pool, url: url.toString(), async close() {
    await pool.end();
    if (!/^test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test schema');
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  } };
}
