import type pg from 'pg';
import { household } from './db.js';
import { DomainError, type Verdict } from './contracts.js';

// Only changes a PostgreSQL row in the caller's transaction. No hardware APIs.
export async function executeSimulated(db: pg.PoolClient, verdict: Verdict) {
  if (verdict.verdict !== 'allow' || verdict.deviceId !== 'porch-light' || verdict.action !== 'turn_on') {
    throw new DomainError('INVALID_INPUT');
  }
  const result = await db.query("UPDATE devices SET state='on' WHERE household_id=$1 AND device_id='porch-light' RETURNING state", [household]);
  if (result.rowCount !== 1) throw new DomainError('UNAVAILABLE');
  return 'on';
}
