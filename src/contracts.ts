import { z } from 'zod';

export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const Action = z.union([
  z.strictObject({ deviceId: z.literal('porch-light'), action: z.literal('turn_on') }),
  z.strictObject({ deviceId: z.literal('front-door'), action: z.literal('unlock') })
]);
export const EventSchema = z.strictObject({
  eventId: Id, routineRevisionId: Id, kind: z.enum(['arrival', 'departure']),
  occurredAt: z.iso.datetime({ offset: true }), source: z.literal('simulated')
});
export const RoutineSchema = z.strictObject({
  revisionId: Id, routineId: Id, sourceText: z.string(), trigger: z.literal('arrival'),
  weekdays: z.array(z.number().int().min(1).max(5)).min(1), timezone: z.literal('Asia/Kolkata'),
  actions: z.array(Action).min(1).max(2).refine(a => new Set(a.map(v => v.deviceId)).size === a.length)
});
export const ApprovalSchema = z.strictObject({
  revisionId: Id, contentHash: z.string().length(64), actor: z.string(), approvedAt: z.iso.datetime()
});
export const SunsetSchema = z.strictObject({
  date: z.iso.date(), timezone: z.literal('Asia/Kolkata'), sunsetAt: z.iso.datetime({ offset: true }),
  source: z.literal('simulated')
});
export const Reason = z.enum(['DOOR_UNLOCK_FORBIDDEN', 'APPROVAL_REQUIRED', 'REVISION_SUPERSEDED',
  'TRIGGER_MISMATCH', 'OUTSIDE_WEEKDAYS', 'SUNSET_UNAVAILABLE', 'NOT_AFTER_SUNSET', 'ARRIVAL_RULE_MATCHED']);
export const VerdictSchema = z.strictObject({
  deviceId: z.enum(['porch-light', 'front-door']), action: z.enum(['turn_on', 'unlock']),
  verdict: z.enum(['allow', 'deny']), reasonCode: Reason
});
export const DecisionSchema = z.strictObject({
  decisionId: z.uuid(), eventId: Id, routineRevisionId: Id, policyVersion: z.string(), evaluatedAt: z.iso.datetime(),
  eventSnapshot: EventSchema, routineSnapshot: RoutineSchema, approvalSnapshot: ApprovalSchema.nullable(),
  sunsetSnapshot: SunsetSchema.nullable(), currentRevision: z.boolean(),
  actions: z.array(VerdictSchema.extend({
    executionStatus: z.enum(['executed', 'not_executed']), actionId: z.uuid().nullable(),
    before: z.string(), after: z.string()
  }))
});
export const RoutineViewSchema = z.strictObject({
  routine: RoutineSchema, contentHash: z.string().length(64), currentRevision: z.boolean(),
  approval: ApprovalSchema.nullable()
});
export const OutcomeSchema = z.strictObject({ decision: DecisionSchema, replayed: z.boolean() });
export const ApproveInput = z.strictObject({ routineRevisionId: Id, contentHash: z.string().length(64) });
export const ErrorCode = z.enum(['INVALID_INPUT', 'NOT_FOUND', 'STALE_REVISION', 'IDEMPOTENCY_CONFLICT', 'UNAVAILABLE']);
export type Code = z.infer<typeof ErrorCode>;
export class DomainError extends Error { constructor(public code: Code) { super(code); } }
export type HomeEvent = z.infer<typeof EventSchema>;
export type Routine = z.infer<typeof RoutineSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type Sunset = z.infer<typeof SunsetSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type PolicyInput = { event: HomeEvent; routine: Routine; approval: Approval | null;
  currentRevision: boolean; sunset: Sunset | null };

export const tools = {
  get_routine: { input: z.strictObject({ routineRevisionId: Id }), output: RoutineViewSchema },
  approve_routine: { input: ApproveInput, output: ApprovalSchema },
  simulate_event: { input: EventSchema, output: OutcomeSchema },
  get_decision: { input: z.strictObject({ eventId: Id }), output: DecisionSchema }
};
export type ToolName = keyof typeof tools;
export const envelope = (value: z.ZodType) => z.strictObject({ value: value.nullable(), error: ErrorCode.nullable() });
