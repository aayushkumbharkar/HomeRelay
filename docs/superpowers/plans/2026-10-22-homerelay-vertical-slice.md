# HomeRelay vertical slice implementation plan

> **For agentic workers:** Use Superpowers executing-plans to implement this plan
> task by task after implementation is requested. Use test-driven-development
> for each behavior change and verification-before-completion for claims. Do not
> dispatch subagents automatically. Checkboxes track future work, not completed work.

**Goal:** Prove that a web backend really invokes a separate official-SDK MCP
server, deterministically evaluates an approved routine, and durably commits one
simulated action with retrievable evidence despite replay and process restart.

**Architecture:** Two Node processes and one PostgreSQL database. The web process
owns an MCP client; only the MCP service evaluates policy and writes domain data.
Simulated device state, action rows and decision evidence commit atomically.

**Tech stack:** TypeScript, Node 24 LTS target, official MCP v2 client/server/Node
adapter, Zod, pg, PostgreSQL 18, Node test runner. One package; no ORM or framework.
Use TypeScript compilation before Node tests; no runtime transpiler required.
Playwright is added only for the browser milestone.

**Spec:** `docs/superpowers/specs/2026-10-22-homerelay-design.md`.
Read also `docs/architecture.md` and `docs/acceptance-tests.md`.

## Global constraints

- Use official compatible MCP SDK packages and Streamable HTTP; negotiated MCP
  protocol must be 2025-11-25 or later.
- PostgreSQL is the durable system of record; no in-memory substitute for proof.
- No simulated device may be described as a real integration.
- Approval never overrides deterministic policy.
- No product test may be reported passing unless executed.

Execution update, 2026-10-22: user's staged request authorized and completed the
M1 backend slice. Original task checklists below remain the design reference;
actual executed commands and evidence are in docs/verification.md. The latest
request deferred the frontend: no HTML page or browser tests were added. M2/M3
remain follow-on milestones, not permission to implement everything.
Do not add Bedrock, remote deployment, voice, live devices, a generic rules engine
or an agent framework to M1.

## Milestone summary

| Milestone | Changed files | Acceptance | Commands and actual result | Remaining risks/blockers |
| --- | --- | --- | --- | --- |
| M0 planning | Nine files listed in docs/verification.md | Required artifacts, inspected environment, no app code | Environment probes executed; product tests NOT RUN; document validation recorded in ledger | DB unavailable; no dependency install/handshake |
| M1 backend vertical slice | Exact implemented files listed in docs/verification.md; initial page deferred | AC-01–10, AC-15 backend checks; real wire call, durable result, replay/restart | Actual: npm run test:unit 12 pass; npm run test:integration 7 pass; npm run typecheck exit 0 | Local prototype; no browser or DB-container decision-restart test |
| M2 complete domain flow | Exact files in Task 5 below | AC-11–14 plus M1 regressions | Planned: npm run test:unit; npm run test:integration; npm run typecheck. Actual: NOT RUN | Parser limits, revision races, approval integrity |
| M3 browser and evidence | Exact files in Task 6 below | AC-16–18 and complete demo | Planned: npm run test:e2e; npm run test:integration; npm run typecheck. Actual: NOT RUN | Browser accessibility, clean setup, deadline/repo/video access |

## File boundaries and command contract

Create files only in the task that needs them:

- `src/contracts.ts`: strict Zod inputs and shared output types; not policy.
- `src/policy.ts`: pure deterministic evaluate function; no DB, network, or clock.
- `src/db.ts`, `db/001-core.sql`, `scripts/migrate.ts`: connection pool and migration.
- `src/decisions.ts`: event transaction/replay plus persisted evidence retrieval.
- `src/routines.ts`: persisted revision reads and explicit approval; M2 editing.
- `src/fixtures.ts`, `scripts/seed.ts`: labelled demo sunset and draft/device seed.
- `src/mcp-server.ts`: SDK tools and HTTP lifecycle, calls domain functions.
- `src/mcp-client.ts`: SDK connection and result validation, no policy fallback.
- `src/web.ts`: same-origin web routes and static file serving.
- `public/index.html`, `public/app.js`: initially only seeded-draft approval,
  arrival, replay, and evidence display; M3 extends these files.
- `tests/helpers/database.ts`, `tests/helpers/processes.ts`: isolated DB fixtures,
  real child-process startup/readiness/shutdown; test-only failure injection.
- Test files: exact unit/integration/e2e names in acceptance matrix.

M1 creates `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`,
`.env.example`, `compose.yaml` and updates `README.md`, `docs/verification.md`.
Use a dedicated test DB URL; never truncate a supplied non-test database. Ignore
`.env`, `node_modules`, `dist`, local test output and credentials; preserve `.agents`.
Compose publishes PostgreSQL only to loopback and uses a named volume. Never use
`down -v` against the demo database as part of verification.

Define these scripts when the first tests are added (commands here are a design):

```json
{
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "test:unit": "npm run build && node --test dist/tests/unit/*.test.js",
  "test:integration": "npm run build && node --test --test-concurrency=1 dist/tests/integration/*.test.js",
  "start:mcp": "node dist/src/mcp-server.js",
  "start:web": "node dist/src/web.js",
  "db:migrate": "npm run build && node dist/scripts/migrate.js",
  "db:seed": "npm run build && node dist/scripts/seed.js"
}
```

Use ESM with NodeNext compilation and `.js` import suffixes; include src, scripts
and tests under rootDir `.` so these output paths agree. TypeScript and necessary
type packages are development dependencies. Verify npm peer metadata before
installing candidate SDK pins; capture the resolved versions and negotiated MCP
revision, not only package names.

## M1 Task 1: deterministic decisions with explicit inputs

Files: package/build files above, `src/contracts.ts`, `src/policy.ts`,
`src/fixtures.ts`, `tests/unit/policy.test.ts`.

Interface: `evaluate(input: PolicyInput): ActionVerdict[]`, with types exported by
contracts.ts. PolicyInput contains a validated event, a routine snapshot (trigger,
weekdays, timezone, actions), approval snapshot or null, currentRevision boolean,
and sunset snapshot or null. ActionVerdict has deviceId, action, verdict
(`allow` or `deny`), reasonCode. Persistence/execution fields are added by Task 2.

- [ ] Check Node 24 and working package registry; inspect SDK peer dependencies.
  Install only the documented runtime/dev packages; commit the lockfile when
  commits are requested. Do not switch to a different protocol implementation.
- [ ] Write a table-driven test for a valid unapproved porch request, then a
  current approved request. Use literal input and expected verdicts. A representative
  assertion in the test body is:

```ts
assert.deepEqual(evaluate(input), [{
  deviceId: 'porch-light', action: 'turn_on',
  verdict: 'deny', reasonCode: 'APPROVAL_REQUIRED'
}]);
```

  Construct `input` in the test from the canonical fixture in acceptance-tests.md;
  never derive expectations by calling policy helpers. Start with a compiling
  stub that returns `[]`, observe this assertion fail, then implement the missing
  rule. Do not count a missing-module error as red.
- [ ] Add one failing test at a time for approved matching arrival, weekend,
  UTC/local day boundary, before/equal sunset, missing sunset, non-arrival,
  superseded revision, and approved unlock. Expected reasons are in the spec.
- [ ] Run `npm run test:unit` after each new case, record red, implement only that
  rule, rerun green. Run `npm run typecheck` after the policy contract stabilizes.
- [ ] Record actual outcomes and touched files. Task acceptance: policy decisions
  depend only on explicit facts; approval cannot authorize unlock; no I/O exists
  in evaluate. M1 is not complete from unit tests alone.

## M1 Task 2: one atomic durable decision, including replay

Files: `src/db.ts`, `db/001-core.sql`, `scripts/migrate.ts`, `src/decisions.ts`,
`src/routines.ts`, `scripts/seed.ts`, `.env.example`, `compose.yaml`,
`tests/helpers/database.ts`, `tests/integration/decision.test.ts`,
`tests/integration/replay.test.ts`, `tests/integration/evidence.test.ts`,
`tests/integration/failures.test.ts`.

Interfaces (async, PostgreSQL-backed):

- `getRoutine(revisionId)` -> revision with hash/current/approval status.
- `approveRoutine(revisionId, contentHash, actor)` -> approval snapshot.
- `processEvent(event)` -> `{decision: Decision, replayed: boolean}`.
- `getDecision(eventId)` -> Decision or null, scoped to configured household.

Functions use a service-owned pg Pool with the URL passed at service startup.
Tests supply an isolated real pool and inspect SQL rows independently. The schema,
Decision fields and transactional order are specified in architecture.md.

- [ ] Establish a verified disposable PostgreSQL 18 connection. Run `SELECT
  version()` and record the result. If blocked, record BLOCKED and stop dependent
  tests; never substitute SQLite or an in-memory fake.
- [ ] Write the approval-required integration case and run it to intended red.
  Add migration, seed and just enough transaction logic to persist that denial.
- [ ] Write explicit approval then matching-arrival case: independently assert
  one action row, porch `on`, door `locked`, and stored approval evidence. Run red,
  implement and run green.
- [ ] Write sequential replay and changed-payload conflict cases. Assert original
  decision identity and unchanged per-event action count. Implement unique event
  insertion, canonical payload hash and existing-result retrieval.
- [ ] Add 10 simultaneous identical requests using independent connections:

```ts
const results = await Promise.all(Array.from({ length: 10 }, () => processEvent(event)));
assert.equal(new Set(results.map(r => r.decision.decisionId)).size, 1);
const count = await testPool.query(
  `SELECT count(*)::int AS n FROM actions a
   JOIN decisions d ON d.decision_id = a.decision_id
   WHERE d.household_id = $1 AND d.event_id = $2`,
  ['demo-home', event.eventId]
);
assert.equal(count.rows[0].n, 1);
```

  `event` is a fresh approved matching canonical event; `testPool` is the helper's
  real database pool. A removed unique constraint or non-atomic action should
  break this test. Extend it through multiple MCP clients in Task 3.
- [ ] Inject an action-insert SQL error via a test-schema-only trigger. Assert no
  partial event/decision/action and unchanged device state; remove the trigger and
  retry the same event ID successfully. Test absent history and immutable evidence.
- [ ] Run `npm run test:integration`, `npm run test:unit`, `npm run typecheck`.
  Record actual red/green outputs. Remaining risk until Task 3: this does not yet
  prove that the web app uses MCP.

## M1 Task 3: cross-process MCP and web route, with failure proof

Files: `src/mcp-server.ts`, `src/mcp-client.ts`, `src/web.ts`,
`tests/helpers/processes.ts`, `tests/integration/mcp.test.ts`,
`tests/integration/validation.test.ts`; extend replay/failures tests from Task 2.

Interfaces: web routes and MCP tools exactly as in architecture.md. The test
process helper starts compiled service entry points with explicit env/ephemeral
ports, waits for readiness, returns process handles/base URLs, and stops only
those owned processes. DB URL is passed only to MCP; web gets MCP URL and secret.

- [ ] Write an HTTP integration assertion against POST /api/events with a real
  MCP child process, plus tools/list/negotiation evidence. Start with a route that
  returns an explicit unavailable response so the intended result assertion fails.
- [ ] Register get_routine, approve_routine, simulate_event and get_decision via
  McpServer. Connect the web service with Client/StreamableHTTPClientTransport.
  Use the official Node transport adapter, not a handcrafted JSON-RPC endpoint.
- [ ] Validate input/output and map domain errors to the documented web statuses.
  Add token, Origin/Host, same-origin CSRF, 16 KiB body-limit tests before handlers
  enforcing those behaviors. No caller can supply approval or policy verdicts.
- [ ] Execute the approved-arrival path through web HTTP. Independently inspect DB
  state and evidence. Rerun replay using multiple clients over real network sockets.
- [ ] Stop only the owned MCP process, request a new event via web, assert 503 and
  no added action. Restart MCP and retry the same ID successfully. Stop DB access
  in the isolated test setup and assert no success response.
- [ ] Run `npm run test:integration` and `npm run typecheck`; record negotiated
  protocol and exact SDK pins. Reject M1 completion for mocked/in-process-only MCP.

## M1 Task 4: minimal observable page and restart proof

Files: `public/index.html`, `public/app.js`, `tests/integration/restart.test.ts`;
update `src/web.ts`, `README.md`, `docs/verification.md`.

- [ ] Add failing test: create approval/event over web, save result, stop both
  children, start fresh children with the same DB and no seed/reset, GET the event.
  Assert the stored decision deeply equals the saved decision and replay keeps
  the action count at one. Test transport reconnection, not an in-memory cache.
- [ ] Implement only missing lifecycle/retrieval behavior. Wire a minimal page
  showing the seeded structured draft and explicit Approve, Simulate, Replay and
  Retrieve controls. Use frontend skill guidance only now; avoid visual expansion.
  The page must use web routes, never fabricated result objects or browser storage
  as the source of evidence. Keep event ID available for retry/retrieval.
- [ ] Run `npm run test:unit`, `npm run test:integration`, `npm run typecheck`.
  Manually open the page and record observed approval/event/evidence behavior if
  browser tooling is available; otherwise mark browser verification NOT RUN.
- [ ] Update README with tested startup/migrate/seed/run instructions and simulation
  limits. Report exact files, AC-01–10/15 results, failures and remaining risks.
- [ ] Stop at M1. Natural-language parsing and the full demonstration remain M2/M3.

## M2 Task 5: proposals, revision approval, visible unlock denial

Planned files: create `src/proposals.ts`, `tests/unit/proposal.test.ts`,
`tests/integration/approval.test.ts`, `tests/integration/denial.test.ts`; modify
`src/contracts.ts`, `src/routines.ts`, `src/mcp-server.ts`, `src/mcp-client.ts`,
`src/web.ts`, `docs/verification.md`. Add a new SQL migration only if the agreed
M1 schema lacks an actually needed constraint; do not rewrite applied migrations.

Acceptance: AC-11–14. `proposeRoutine(text)` returns a draft or clarification;
`reviseRoutine(revisionId, expectedHash, changes)` returns a new unapproved revision.
Supported text vocabulary and structured fields are in the spec. Unsupported
language produces clarification. Explicit approval is still a separate tool.

- [ ] For each parser behavior, write literal input/output expectations, observe
  red, implement minimally, rerun. Include ambiguous text and bypass instructions.
- [ ] For editing, first test stale hash rejection, r2 unapproved, r1 superseded,
  and old-decision retrieval; then implement serialized routine-head changes.
  Add concurrent edit/approve/evaluate tests that permit only serializable outcomes.
- [ ] Propose and approve front-door/unlock, then send a fresh matching event:
  assert DOOR_UNLOCK_FORBIDDEN, zero unlock rows, door locked. Also test a mixed
  porch/unlock proposal: porch action committed, unlock denied, both visible.
- [ ] Run `npm run test:unit`, `npm run test:integration`, `npm run typecheck`.
  Actual results now: NOT RUN. Risks: parser coverage and approval races. Record
  the exact supported language, without calling the parser a general AI model.

## M3 Task 6: complete browser flow and judging evidence

Planned files: modify `public/index.html`, `public/app.js`, `src/web.ts`,
`package.json`, `package-lock.json`, `README.md`, `docs/verification.md`; create
`playwright.config.ts`, `tests/e2e/demo.spec.ts`, `docs/demo-script.md`,
`docs/product-feedback.md`; extend `tests/integration/restart.test.ts` for a
database-container restart without deleting its volume.

Acceptance: AC-16–18 and all earlier tests. Use frontend design guidance only for
these interface changes. Reuse the current HTML/JS unless a concrete requirement
justifies another dependency. Add `test:e2e` script running Playwright.

- [ ] Write failing browser tests for text -> editable draft -> explicit approval
  -> matching arrival -> unlock denial -> replay -> refresh/history. Use labelled
  controls and visible outcomes; query DB action counts independently at the end.
- [ ] Implement only the corresponding UI states. Show pending/unapproved,
  allowed/executed, denied, replayed and error distinctly; expose evidence IDs,
  policy reasons and simulation labels. Never display transport success as an
  executed action when the decision says denied.
- [ ] Run `npm run test:e2e`, `npm run test:integration`, `npm run typecheck`.
  Verify keyboard navigation and error recovery. Restart PostgreSQL with its
  volume intact and retrieve the earlier decision before claiming DB-restart proof.
- [ ] Follow README from a clean setup; record exact versions and outputs. Write a
  demo script under three minutes showing the five requested behaviors plus real
  MCP evidence. Product feedback must describe observed SDK/tool friction only.
- [ ] Review repository access/licensing and video accessibility before submission;
  do not automatically publish, invite collaborators or submit. Current results:
  NOT RUN. Remaining risks: clean-environment reproducibility and deadline.

## Completion boundary and self-review

M1 proves MCP, deterministic policy and durable simulated execution. M2 supplies
natural-language review/approval semantics and the denial scenario. M3 proves the
complete user experience and judging evidence. Each acceptance ID is assigned to
a task above; no milestone can inherit a passing result from its plan text.
Bedrock/native Alexa+/real-device work requires its own evidence and is not needed
to close these milestones. Current status: backend M1 executed; M2/M3 deferred.
