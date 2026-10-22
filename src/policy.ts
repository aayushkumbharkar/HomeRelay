import type { PolicyInput, Verdict } from './contracts.js';
export function localDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}
export const POLICY_VERSION = 'household-v1';
// The denial codes in the precedence evaluate() applies; a unit test pins this to evaluate().
export const CHECK_ORDER = ['DOOR_UNLOCK_FORBIDDEN', 'REVISION_SUPERSEDED', 'APPROVAL_REQUIRED', 'TRIGGER_MISMATCH',
  'OUTSIDE_WEEKDAYS', 'SUNSET_UNAVAILABLE', 'NOT_AFTER_SUNSET'] as const satisfies readonly Verdict['reasonCode'][];
export function evaluate({ event, routine, approval, currentRevision, sunset }: PolicyInput): Verdict[] {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: routine.timezone, weekday: 'short' }).format(new Date(event.occurredAt));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
  return routine.actions.map(action => {
    let reasonCode: Verdict['reasonCode'];
    if (action.action === 'unlock') reasonCode = 'DOOR_UNLOCK_FORBIDDEN';
    else if (!currentRevision) reasonCode = 'REVISION_SUPERSEDED';
    else if (!approval || approval.revisionId !== routine.revisionId) reasonCode = 'APPROVAL_REQUIRED';
    else if (event.kind !== routine.trigger) reasonCode = 'TRIGGER_MISMATCH';
    else if (!routine.weekdays.includes(weekday)) reasonCode = 'OUTSIDE_WEEKDAYS';
    else if (!sunset || sunset.timezone !== routine.timezone || sunset.date !== localDate(event.occurredAt, routine.timezone)) reasonCode = 'SUNSET_UNAVAILABLE';
    else if (Date.parse(event.occurredAt) <= Date.parse(sunset.sunsetAt)) reasonCode = 'NOT_AFTER_SUNSET';
    else reasonCode = 'ARRIVAL_RULE_MATCHED';
    return { ...action, reasonCode, verdict: reasonCode === 'ARRIVAL_RULE_MATCHED' ? 'allow' : 'deny' };
  });
}
