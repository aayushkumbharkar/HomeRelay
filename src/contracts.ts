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
export const Weekday = z.number().int().min(0).max(6);
export const CandidateRoutineSchema = RoutineSchema.extend({ weekdays: z.array(Weekday).min(1).max(7) });
export const CandidateChangeSchema = z.strictObject({
  weekdays: z.array(Weekday).min(1).max(7).refine(d => new Set(d).size === d.length),
  actions: RoutineSchema.shape.actions.optional()
});
export const PreflightInput = z.strictObject({ routineRevisionId: Id, candidate: CandidateChangeSchema });
export const ScenarioId = z.enum(['weekday-after-sunset', 'saturday-after-sunset', 'before-sunset',
  'missing-sunset', 'unapproved-routine', 'door-unlock']);
const Evaluation = z.strictObject({ outcome: z.enum(['allow', 'deny']), verdicts: z.array(VerdictSchema) });
export const PreflightCaseSchema = z.strictObject({
  scenarioId: ScenarioId, title: z.string(), explanation: z.string(), event: EventSchema,
  sunset: SunsetSchema.nullable(), approvalBasis: z.enum(['simulated_for_preflight', 'none']), mustDeny: z.boolean(),
  baseline: Evaluation, candidate: Evaluation, changed: z.boolean(),
  change: z.enum(['unchanged', 'newly_allowed', 'newly_denied', 'reason_changed']), safetyViolation: z.boolean()
});
export const Finding = z.enum(['SAFETY_INVARIANT_VIOLATED', 'PROHIBITED_ACTION_REQUESTED', 'PREVIOUSLY_ALLOWED_CASE_DENIED']);
export const PreflightSuiteSchema = z.strictObject({
  baseline: RoutineViewSchema, candidate: CandidateRoutineSchema,
  changes: z.array(z.strictObject({ field: z.enum(['weekdays', 'actions']), before: z.string(), after: z.string() })),
  simulatedApproval: z.strictObject({ actor: z.literal('preflight-simulation'), persisted: z.literal(false) }),
  activated: z.literal(false), cases: z.array(PreflightCaseSchema),
  summary: z.strictObject({ verdict: z.enum(['pass', 'fail']), total: z.number().int(), changed: z.number().int(),
    safetyViolations: z.number().int(), findings: z.array(Finding) })
});
export const PreflightRunSchema = PreflightSuiteSchema.extend({ runId: z.uuid(), createdAt: z.iso.datetime(), policyVersion: z.string() });
export const IncidentSchema = z.strictObject({
  basis: z.literal('recorded'), decision: DecisionSchema,
  actions: z.array(z.strictObject({ deviceId: VerdictSchema.shape.deviceId, action: VerdictSchema.shape.action,
    verdict: VerdictSchema.shape.verdict, reasonCode: Reason, executionStatus: z.enum(['executed', 'not_executed']),
    actionId: z.uuid().nullable(), checks: z.array(z.strictObject({ reasonCode: Reason, check: z.string(),
      evidence: z.string(), status: z.enum(['passed', 'failed', 'not_reached']) })) }))
});
export const ErrorCode = z.enum(['INVALID_INPUT', 'NOT_FOUND', 'STALE_REVISION', 'IDEMPOTENCY_CONFLICT', 'UNAVAILABLE']);
export type Code = z.infer<typeof ErrorCode>;
export class DomainError extends Error { constructor(public code: Code) { super(code); } }
export type HomeEvent = z.infer<typeof EventSchema>;
export type Routine = z.infer<typeof RoutineSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type Sunset = z.infer<typeof SunsetSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type CandidateChange = z.infer<typeof CandidateChangeSchema>;
export type RoutineView = z.infer<typeof RoutineViewSchema>;
export type PolicyInput = { event: HomeEvent; routine: Routine; approval: Approval | null;
  currentRevision: boolean; sunset: Sunset | null };

export const tools = {
  get_home: { input: z.strictObject({}), output: z.strictObject({ devices: z.array(z.strictObject({deviceId: z.enum(["front-door","porch-light"]), state: z.enum(["off","on","locked"])})) }) },
  list_decisions: { input: z.strictObject({}), output: z.array(DecisionSchema) },
  get_routine: { input: z.strictObject({ routineRevisionId: Id }), output: RoutineViewSchema },
  approve_routine: { input: ApproveInput, output: ApprovalSchema },
  simulate_event: { input: EventSchema, output: OutcomeSchema },
  get_decision: { input: z.strictObject({ eventId: Id }), output: DecisionSchema },
  reconstruct_incident: { input: z.strictObject({ eventId: Id }), output: IncidentSchema },
  run_preflight: { input: PreflightInput, output: PreflightRunSchema },
  get_preflight_run: { input: z.strictObject({ runId: z.uuid() }), output: PreflightRunSchema }
};
export type ToolName = keyof typeof tools;
export const envelope = (value: z.ZodType) => z.strictObject({ value: value.nullable(), error: ErrorCode.nullable() });
