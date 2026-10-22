import type pg from 'pg';
import { household, hash, transaction } from './db.js';
import type { Routine, Sunset } from './contracts.js';

export const routine: Routine = {
  revisionId: 'r1', routineId: 'arrival', sourceText: 'On weekdays after sunset, when I arrive home, turn on the porch light.',
  trigger: 'arrival', weekdays: [1,2,3,4,5], timezone: 'Asia/Kolkata',
  actions: [{ deviceId: 'porch-light', action: 'turn_on' }]
};
export function sunsetFor(date: string): Sunset | null {
  if (date !== '2026-10-21') return null;
  return { date, timezone: 'Asia/Kolkata', sunsetAt: '2026-10-21T18:00:00+05:30', source: 'simulated' };
}
export async function seed(pool: pg.Pool) {
  await transaction(pool, async db => {
    for (const draft of [routine, { ...routine, revisionId: 'door-denial-r1', routineId: 'door-denial', sourceText: 'Request a simulated front-door unlock. Policy must deny this action.', actions: [{deviceId: 'front-door', action: 'unlock'}] }]) {
    await db.query('INSERT INTO routine_revisions (household_id, revision_id, routine_id, content, content_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [household, draft.revisionId, draft.routineId, draft, hash(draft)]);
    await db.query('INSERT INTO routine_heads VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [household, draft.routineId, draft.revisionId]);
    }
    await db.query("INSERT INTO devices VALUES ($1,'porch-light','off'),($1,'front-door','locked') ON CONFLICT DO NOTHING", [household]);
  });
}
