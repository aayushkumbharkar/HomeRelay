import type pg from 'pg';
import { IncidentSchema, type Decision, type Verdict } from './contracts.js';
import { CHECK_ORDER } from './policy.js';
import { getDecision } from './decisions.js';

// Reconstruction formats the stored decision only. The recorded reason code locates the failed
// check within the policy precedence; it never re-evaluates history with current rules.
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const checks: Record<typeof CHECK_ORDER[number], [string, (d: Decision, a: Verdict) => string]> = {
  DOOR_UNLOCK_FORBIDDEN: ['Action is not a door unlock', (_, a) => `Requested ${a.deviceId}/${a.action}`],
  REVISION_SUPERSEDED: ['Revision was the current head', d => `Recorded currentRevision=${d.currentRevision} for ${d.routineRevisionId}`],
  APPROVAL_REQUIRED: ['Exact revision explicitly approved', d => d.approvalSnapshot
    ? `Approved by ${d.approvalSnapshot.actor} at ${d.approvalSnapshot.approvedAt}; hash ${d.approvalSnapshot.contentHash.slice(0, 12)}…`
    : 'No approval snapshot recorded'],
  TRIGGER_MISMATCH: ['Event matches the routine trigger', d => `Event ${d.eventSnapshot.kind}; trigger ${d.routineSnapshot.trigger}`],
  OUTSIDE_WEEKDAYS: ['Local weekday is in the schedule', d => {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: d.routineSnapshot.timezone, weekday: 'short' }).format(new Date(d.eventSnapshot.occurredAt));
    return `Event on ${day} (${d.routineSnapshot.timezone}); schedule ${d.routineSnapshot.weekdays.map(n => days[n]).join(', ')}`;
  }],
  SUNSET_UNAVAILABLE: ['Dated sunset evidence available', d => d.sunsetSnapshot
    ? `Sunset ${d.sunsetSnapshot.sunsetAt} for ${d.sunsetSnapshot.date} (simulated fixture)` : 'No sunset snapshot recorded'],
  NOT_AFTER_SUNSET: ['Arrival after sunset', d => `Event ${d.eventSnapshot.occurredAt}; sunset ${d.sunsetSnapshot?.sunsetAt ?? 'not recorded'}`]
};

export function reconstruct(decision: Decision) {
  return IncidentSchema.parse({ basis: 'recorded', decision, actions: decision.actions.map(action => {
    const failed = (CHECK_ORDER as readonly string[]).indexOf(action.reasonCode);
    const reached = failed === -1 ? CHECK_ORDER.length : failed;
    return { deviceId: action.deviceId, action: action.action, verdict: action.verdict, reasonCode: action.reasonCode,
      executionStatus: action.executionStatus, actionId: action.actionId,
      checks: CHECK_ORDER.map((reasonCode, i) => ({ reasonCode, check: checks[reasonCode][0],
        evidence: checks[reasonCode][1](decision, action),
        status: i < reached ? 'passed' : i === reached ? 'failed' : 'not_reached' })) };
  }) });
}

export async function reconstructIncident(pool: pg.Pool, eventId: string) {
  const decision = await getDecision(pool, eventId);
  return decision ? reconstruct(decision) : null;
}
