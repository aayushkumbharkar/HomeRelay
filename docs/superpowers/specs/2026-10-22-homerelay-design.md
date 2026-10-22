> Continuation 2026-10-22: seeded-draft UI implemented; local browser flow passed.
> Render deployment in progress. See docs/render-deployment.md and verification.md.
> Older deferred-scope/status notes below are historical.

# HomeRelay project specification

Date: 2026-10-22, Asia/Calcutta. Status: adopted design; first backend slice
implemented. Full natural-language and browser demonstration remains future scope.

## Goal

Make household automation inspectable and bounded: describe a routine, inspect
and edit its structured proposal, approve it explicitly, simulate an event,
observe deterministic policy enforcement, and explain the result from persisted
evidence. Target the Alexa+ primary track with a genuine self-hosted MCP service.

## Required demonstration

1. Enter: “On weekdays after sunset, when I arrive home, turn on the porch light.”
2. Show editable trigger, weekdays, timezone, sunset source, device and action.
   Creation and editing cause no action. Explicitly approve the displayed revision.
3. Simulate Wednesday 2026-10-21 at 19:00 Asia/Kolkata, with a clearly labelled
   simulated sunset at 18:00. The porch light becomes on; the front door stays locked.
4. Propose an unlock action in a separate routine revision/request, explicitly
   approve that proposal, and simulate a new arrival event. The server records
   `DOOR_UNLOCK_FORBIDDEN`; there is no executed unlock action.
5. Replay the original arrival event with its original ID and payload. Show the
   original decision ID and a replay indicator; no new action is recorded.
6. Refresh, then restart both application processes. Retrieve the original
   decision and its stored evidence without re-evaluating or re-executing it.

The unlock demonstration is a new event; reusing the original event ID with
changed input must produce an idempotency conflict, not a fresh evaluation.

## Scope and explicit assumptions

- One local demo household and one trusted local operator initially. No hosted
  multi-user claim. Local approval records identify the configured demo operator.
- Household timezone is `Asia/Kolkata`; store timezone on each routine revision.
  Weekday means Monday through Friday in that timezone, not the server timezone.
- Events include an absolute timestamp with offset. The simulator supports
  historical fixture times; approval must exist when processing starts, not
  necessarily before the simulated timestamp.
- Sunset is a server-owned, dated simulation fixture, not a live astronomical
  calculation or a boolean supplied by the browser. After sunset is strictly
  `occurredAt > sunsetAt`; equal time does not match. Require a fixture for the
  event's local calendar date and the revision's timezone.
- Initial natural-language support is a labelled deterministic parser for the
  documented arrival routine vocabulary. Unknown or ambiguous text returns
  clarification, never silently guessed executable actions. Bedrock may later
  propose the same schema but cannot approve or execute it.
- “Allowed” means permitted; “executed” means its simulated state change and
  action record committed successfully. A failed commit is never success.
- Remote hosting, actual Alexa onboarding, live devices, general scheduling,
  multi-agent orchestration, vector search, queues, ORM and a design system are
  outside the first slice.

## Product contracts

Routine revisions have immutable IDs, source text, trigger `arrival`, weekdays,
timezone, ordered unique requested actions and a content hash. Supported action
pairs are `porch-light / turn_on` and `front-door / unlock`; the latter is
representable so policy can explicitly deny it. Unknown pairs are invalid input.
New and edited revisions start unapproved. Approval references the exact revision
and hash, an operator, and a server timestamp. Approval does not execute anything.
Editing supersedes the prior active revision; stale approval attempts fail, and
future events cannot execute a superseded revision. Historical results remain.

Each event carries `eventId`, `routineRevisionId`, `kind`, `occurredAt`, and
`source: simulated`. Household identity comes from trusted server configuration,
not client input. Rules are evaluated in this order for each requested action:

1. Door unlock is always denied (`DOOR_UNLOCK_FORBIDDEN`).
2. Missing current-revision approval denies (`APPROVAL_REQUIRED`); superseded
   revision denies (`REVISION_SUPERSEDED`).
3. Non-arrival event, weekend, missing sunset fixture, or time at/before sunset
   yields respectively `TRIGGER_MISMATCH`, `OUTSIDE_WEEKDAYS`,
   `SUNSET_UNAVAILABLE`, or `NOT_AFTER_SUNSET` and no action.
4. An approved porch-light action with all conditions met is allowed
   (`ARRIVAL_RULE_MATCHED`) and executed in the simulation transaction.

Record all evaluated facts, including approval state, even when a higher-priority
denial determines the final reason. Allowed actions may execute even if another
action in the same proposal is denied; display a mixed outcome clearly.

Malformed timestamps, unknown action/device pairs, unsupported fields and invalid
IDs are rejected without device changes. Well-formed policy denials are durable
decision results, not transport failures. DB/MCP outages return an error without
a fabricated decision. A response lost after commit is resolved by replaying the
same event ID, not by inventing a new ID.

## Success criteria

All AC-01 through AC-18 in [acceptance tests](../../acceptance-tests.md) must pass
for the complete product. M1 intentionally proves only the infrastructure and
transactional core using a seeded, initially unapproved routine. M2 adds natural
language, revisions, and the explicit unlock demonstration. M3 supplies the
complete browser demonstration and submission evidence. M1 is not the full demo.

Global constraints for every milestone:

- Use official compatible MCP SDK packages and Streamable HTTP; negotiated MCP
  protocol must be 2025-11-25 or later.
- PostgreSQL is the durable system of record; no in-memory substitute for proof.
- No simulated device may be described as a real integration.
- Approval never overrides deterministic policy.
- No product test may be reported passing unless executed.

See [architecture](../../architecture.md) for boundaries and transaction design,
[risks](../../risks.md) for unresolved dependencies, and
[official sources](../../sources.md) for track requirements.
