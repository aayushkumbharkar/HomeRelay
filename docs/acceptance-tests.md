> Continuation 2026-10-22: seeded-draft UI implemented; local browser flow passed.
> Render deployment in progress. See docs/render-deployment.md and verification.md.
> Older deferred-scope/status notes below are historical.

# Acceptance test specification

Status: backend M1 executable tests now exist; see verification.md for actual
results. The matrix retains original planned filenames; implemented evidence and
history checks are grouped into decision.test.ts, denial.test.ts and restart.test.ts.
M2/M3 proposal and browser behavior remains unimplemented.
Use Node's test runner for unit/integration tests and Playwright only when browser
interaction is implemented. Integration tests use separate child processes, real
TCP Streamable HTTP, and real PostgreSQL. Expected values are hand-derived.

## Canonical fixture

Household `demo-home`; operator `demo-operator`; routine `arrival`; revision `r1`;
timezone `Asia/Kolkata`; weekdays Mon-Fri; trigger arrival; porch-light/turn_on.
Initial state: porch off, front door locked, no approval. Server sunset fixture:
2026-10-21T18:00:00+05:30; matching event:
`{eventId: "arrival-001", routineRevisionId: "r1", kind: "arrival",
occurredAt: "2026-10-21T19:00:00+05:30", source: "simulated"}`.
Use separate event IDs for different test inputs. Seed additional dated sunset
fixtures explicitly; never rely on current date, network weather, or host timezone.

## Acceptance matrix

| ID / milestone | Given / when | Required observable result | Planned test |
| --- | --- | --- | --- |
| AC-01 M1 | Web backend connects to real MCP listener | initialize completes, negotiated version >=2025-11-25, tools/list exposes required tools; event route returns real tool result | tests/integration/mcp.test.ts |
| AC-02 M1 | Seeded draft; simulate before approval | Persist APPROVAL_REQUIRED, zero actions, porch off, door locked | tests/integration/decision.test.ts |
| AC-03 M1 | Explicit approval of r1/hash, then new matching event | One ARRIVAL_RULE_MATCHED decision and committed action; porch on, door locked; evidence references approval | tests/integration/decision.test.ts |
| AC-04 M1 | Same event ID and normalized payload repeated, then 10 concurrent identical calls on a fresh ID | Same decision ID on every successful response, one event/decision/action for that ID; replay flag on repeats | tests/integration/replay.test.ts |
| AC-05 M1 | Reuse committed ID with changed timestamp or revision | IDEMPOTENCY_CONFLICT; no new state change/action, old evidence unchanged | tests/integration/replay.test.ts |
| AC-06 M1 | Commit decision; stop and restart web and MCP using same DB | GET returns same ID and evidence; replay adds no action | tests/integration/restart.test.ts |
| AC-07 M1 | Fixture weekend, before sunset, exactly sunset, missing sunset, non-arrival | Correct respective reason codes; no action; include timezone boundary where UTC Friday is local Saturday | tests/unit/policy.test.ts |
| AC-08 M1 | Stop MCP, then invoke web simulation route | Visible unavailable error; no direct-policy fallback or fabricated success | tests/integration/failures.test.ts |
| AC-09 M1 | DB unavailable or test-only SQL trigger rejects action insert | Error, no partial event/decision/device/action commit; retry after recovery yields one committed result | tests/integration/failures.test.ts |
| AC-10 M1 | Query nonexistent event; query old decision after new routine/policy facts exist | NOT_FOUND for absent ID; old explanation uses original stored facts only | tests/integration/evidence.test.ts |
| AC-11 M2 | Enter supported arrival sentence; create and edit proposal | Editable structured fields match sentence, both operations produce no action | tests/unit/proposal.test.ts and tests/integration/approval.test.ts |
| AC-12 M2 | Approve r1; edit to r2; attempt stale approval and evaluate r2 | Stale approval rejected; r2 requires new approval; r1 superseded; old history retained | tests/integration/approval.test.ts |
| AC-13 M2 | Approve proposal requesting front-door/unlock; matching new event | Durable DOOR_UNLOCK_FORBIDDEN even with approval, zero unlock action rows, door locked | tests/integration/denial.test.ts |
| AC-14 M2 | Unknown/ambiguous sentence or prompt asking to bypass approval/policy | Clarification or non-executable draft; no approval or execution | tests/unit/proposal.test.ts |
| AC-15 M1 | Malformed time, unknown fields/actions, forged approval field; bad MCP token/Origin | Reject input/access, no simulated effects; no secrets in error | tests/integration/validation.test.ts |
| AC-16 M3 | Complete primary flow in a real browser, including refresh | Proposal/approval/denial/replay/history visible; simulation labels explicit; fresh page gets DB evidence | tests/e2e/demo.spec.ts |
| AC-17 M3 | Clean documented setup on isolated DB with pinned dependencies | Another operator can run demo and tests; saved actual outputs and protocol version; database-container restart retains history | docs/verification.md, tests/integration/restart.test.ts |
| AC-18 M3 | Keyboard operation; submitted evidence review | Inputs labelled, focus usable, pending/error/denial/replay states understandable; demo under 3 minutes and claims match evidence | tests/e2e/demo.spec.ts, docs/demo-script.md |

## TDD and failure evidence

For each executable test, record the bug it catches before writing it. Observe a
meaningful failing assertion before implementation; then record the same command's
passing result. Missing packages, refused DB connections and syntax errors are
setup blockers, not successful red-phase evidence. Never skip integration tests
silently when PostgreSQL is unavailable; fail with a clear prerequisite message.

Use DB queries from the test harness as an independent observer. Check row counts
per event plus actual device state, not just HTTP 200 or an SDK mock call count.
Restart tests create new OS processes and a new MCP client without reseeding.
Race tests use multiple clients/connections so uniqueness is genuinely exercised.
Rollback tests install an isolated test-schema SQL trigger that raises during an
action insert; no production test-only failure endpoint is permitted.

Every milestone entry in the plan lists commands and current actual status.
The [verification ledger](verification.md) is the source of executed results.
