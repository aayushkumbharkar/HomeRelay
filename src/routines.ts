import type pg from 'pg';
import { RoutineViewSchema, ApprovalSchema, DomainError } from './contracts.js';
import { household, transaction } from './db.js';

export async function readRoutine(db: pg.Pool | pg.PoolClient, id: string, lock = false) {
  const result = await db.query(`SELECT r.content, r.content_hash, h.revision_id = r.revision_id AS current,
    a.actor, a.approved_at FROM routine_revisions r
    JOIN routine_heads h ON h.household_id=r.household_id AND h.routine_id=r.routine_id
    LEFT JOIN approvals a ON a.household_id=r.household_id AND a.revision_id=r.revision_id
    WHERE r.household_id=$1 AND r.revision_id=$2 ${lock ? 'FOR UPDATE OF h' : ''}`, [household, id]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return RoutineViewSchema.parse({ routine: row.content, contentHash: row.content_hash,
    currentRevision: row.current, approval: row.approved_at ? {
      revisionId: id, contentHash: row.content_hash, actor: row.actor, approvedAt: row.approved_at.toISOString()
    } : null });
}
export const getRoutine = (pool: pg.Pool, id: string) => readRoutine(pool, id);
export async function approveRoutine(pool: pg.Pool, id: string, contentHash: string) {
  return transaction(pool, async db => {
    const view = await readRoutine(db, id, true);
    if (!view) throw new DomainError('NOT_FOUND');
    if (!view.currentRevision || view.contentHash !== contentHash) throw new DomainError('STALE_REVISION');
    await db.query('INSERT INTO approvals (household_id,revision_id,content_hash,actor) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [household, id, contentHash, 'demo-operator']);
    const approved = await db.query('SELECT actor,approved_at FROM approvals WHERE household_id=$1 AND revision_id=$2', [household, id]);
    return ApprovalSchema.parse({ revisionId: id, contentHash, actor: approved.rows[0].actor, approvedAt: approved.rows[0].approved_at.toISOString() });
  });
}
