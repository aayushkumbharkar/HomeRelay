# Inspection and verification ledger

## M0: planning and environment inspection — 2026-10-22

Changed files: `AGENTS.md`, `README.md`, `docs/architecture.md`,
`docs/acceptance-tests.md`, `docs/risks.md`, `docs/sources.md`, this ledger,
`docs/superpowers/specs/2026-10-22-homerelay-design.md`,
`docs/superpowers/plans/2026-10-22-homerelay-vertical-slice.md`.

Acceptance: inspect environment/repo/skills/official docs; write the requested
planning artifacts; define the smallest real-MCP/PostgreSQL slice; implement no
application code. Document checks do not prove any product behavior.

| Command / inspection actually performed | Actual result |
| --- | --- |
| Get-Location | C:\Users\Aayush\HomeRelay |
| git status --short (initial) | Only `?? .agents/`; preserved |
| git branch --show-current | master |
| git log -1 --oneline | Failed: branch has no commits |
| git remote -v; git ls-files | No remote output; no tracked files |
| Root listing and rg file inventory | `.git/` and `.agents/` only; no application manifest/tests/docs |
| Ancestor AGENTS.md path checks | No files found at C:/, C:/Users/, or C:/Users/Aayush/ |
| Installed skill directory inventory | Superpowers workflow/TDD skills and karpathy-guidelines found in C:/Users/Aayush/.agents/skills; local repo skills concern design |
| Skill reads | using-superpowers + Codex reference, brainstorming, writing-plans, test-driven-development + writing-good-tests, karpathy-guidelines read; frontend skills not loaded |
| node --version; npm --version | v20.20.2; 10.8.2 |
| python --version | Python 3.10.9; not selected for app |
| docker --version | 29.2.0, build 0b9d198 |
| docker info --format '{{.ServerVersion}}' | Failed: dockerDesktopLinuxEngine named pipe absent |
| psql --version | PostgreSQL client 18.4 |
| pg_isready | No response at default :5432 |
| Get-Service *postgres* | Failed to open Service Control Manager; service installation/status undetermined |
| Test-Path Env:DATABASE_URL; Test-Path Env:AWS_PROFILE | False; False. No secret values read or printed |
| Get-Command aws | AWS CLI executable found; authentication/model access NOT TESTED |
| Initial sandbox npm metadata lookup | Did not return; interrupted. No package installed |
| Bounded npm view with network access: server version engines | 2.3.1, node >=20 |
| Bounded npm view with network access: client version engines | 2.3.1, node >=20 |
| Bounded npm view with network access: node adapter version engines | 2.1.1, node >=20 |
| Official-source review | See sources.md; failed guessed SDK transports URL replaced with linked official HTTP page |
| Inline Python Markdown check over AGENTS.md, README.md and docs/**/*.md | PASS: 9 files; all relative Markdown links resolve, code fences balanced, no trailing whitespace. This checks documentation only |
| rg -n 'TBD\|TODO\|fill in details\|implement later' AGENTS.md README.md docs | No matches (rg exit 1 means no matches; the combined shell command consequently returned 1, not a documentation-check failure) |
| Final git status --short | Untracked .agents/ unchanged; new AGENTS.md, README.md, docs/. No application files added |
| Manual specification/plan consistency review | AC-01–18 mapped to milestones; approval, replay, transaction, simulation and evidence invariants covered; future tests explicitly NOT RUN |

## M0 product test results (historical; superseded by M1 below)

| Milestone | Actual result | Remaining gate |
| --- | --- | --- |
| M1 real MCP and durable decisions | NOT RUN: no application or executable tests | Working PostgreSQL, runtime/dependency installation, implementation request |
| M2 proposals, revisions, unlock denial | NOT RUN: not implemented | M1 and proposal/revision implementation |
| M3 browser demo and judging evidence | NOT RUN: not implemented | M1/M2, browser implementation and reproducible clean setup |

No unit/integration/browser product tests were executed. No MCP connection or
durability claim has been verified. No model call or real-device integration exists.

The preceding paragraph describes M0 only. Current backend evidence follows.

## M1 implementation — 2026-10-22

Scope: user's staged implementation request. Implement backend only; initial HTML
page from the earlier plan is deferred. No frontend skills were loaded. Use
Superpowers executing-plans, TDD, systematic-debugging and verification guidance.
Read worktree guidance: this repository had no commit/base ref, so a linked
worktree could not carry the existing untracked specification. Created branch
`codex/m1-vertical-slice` in place. No commits, merges, pushes or PRs were made.

### Stage 1: environment and dependencies

Acceptance: usable isolated PostgreSQL and compatible installed SDK/runtime.

- Sandbox Docker access failed; the same inspection outside the sandbox showed
  Docker engine 29.2.0 working. Host PostgreSQL 18 service was running and 5432
  accepted connections. PostgreSQL 17 was installed but stopped. The Docker
  Windows service being stopped did not mean the Desktop Linux engine was down.
- Chose dedicated Compose PostgreSQL rather than using unknown host credentials.
  Initial `docker compose up -d --wait` failed on port 55432. `netsh interface ipv4
  show excludedportrange protocol=tcp` showed reserved range 55425–55524. Changing
  only the published loopback port to 15432 yielded a healthy container.
- `docker compose exec -T db psql -U homerelay -d homerelay -c 'SELECT version();'`
  returned PostgreSQL 18.6 (Debian). Created separate `homerelay_test` DB.
- Generated credentials only in ignored `.env`; no credential values were printed.
  `git check-ignore .env node_modules dist` confirmed all three are ignored.
- `npm view` verified server/client 2.3.1 (Node >=20), node adapter 2.1.1 with
  server ^2.3.0 peer. Installed exact versions and locked dependencies. Installed
  project Node 24.22.0, TypeScript 7.0.2, pg 8.23.1, Zod 4.6.7 and necessary types.
  npm install reported zero vulnerabilities. System Node 20.20.2/npm 10.8.2 unchanged.
- `npm ls --depth=0` exited 0 and listed expected versions; node's runtime installer
  left `node-bin-setup@1.1.4` marked extraneous. It is installer support, not an
  application dependency or an MCP implementation.
- Pinned the tested postgres image by digest in compose.yaml. Re-ran
  `docker compose up -d --wait`: exit 0, healthy, existing named volume retained.

Stage 1 changed files: `.gitignore`, `.env.example`, `compose.yaml`, `package.json`,
`package-lock.json`, `tsconfig.json`; generated local `.env` is ignored.
Remaining environment blockers: none for this slice outside the restricted
sandbox. Database shutdown is not required when Codex tests finish; the dedicated
development container is left running. No unrelated host service was modified.

### Stage 2: real MCP proof gate

Files: `src/mcp-http.ts`, `tests/helpers/processes.ts`,
`tests/helpers/probe-server.ts`, `tests/integration/mcp.test.ts`.

Acceptance: separate server process; real HTTP initialization/tool discovery;
structured response; invalid arguments rejected; official SDK owns protocol.

`npm run test:mcp` first exited 1: initialization succeeded but tools/list returned
[] rather than simulation_info. After registering the validated probe tool, the
same command exited 0: **1 test passed, 0 failed/skipped**. It negotiated
**MCP 2025-11-25**, received `{label: porch, simulated: true}` as structuredContent,
and asserted isError=true for a numeric label. Only after this gate passed did
policy/persistence implementation begin. The proof tool is test-only, not exposed
by the application MCP service. Stage 2 blockers: none.

### Stage 3: transactional backend slice

New application files:

- `src/contracts.ts`, `src/policy.ts`, `src/db.ts`, `src/fixtures.ts`
- `src/routines.ts`, `src/decisions.ts`, `src/simulated-action.ts`
- `src/mcp-server.ts`, `src/mcp-client.ts`, `src/web.ts`
- `db/001-core.sql`, `scripts/migrate.ts`, `scripts/seed.ts`

New verification files:

- `tests/unit/policy.test.ts`
- `tests/helpers/database.ts`, `tests/helpers/fixtures.ts`
- `tests/integration/decision.test.ts`, `tests/integration/denial.test.ts`
- `tests/integration/replay.test.ts`, `tests/integration/failures.test.ts`
- `tests/integration/restart.test.ts`, `tests/integration/validation.test.ts`

Updated documentation: `AGENTS.md`, `README.md`, `docs/architecture.md`,
`docs/acceptance-tests.md`, `docs/risks.md`, `docs/verification.md`,
`docs/superpowers/specs/2026-10-22-homerelay-design.md`,
`docs/superpowers/plans/2026-10-22-homerelay-vertical-slice.md`.
Pre-existing `.agents/` and `docs/sources.md` were not changed in this implementation.

| Execution | Actual outcome |
| --- | --- |
| Initial npm run test:unit with evaluator stub | 11 expected verdict failures, 1 schema test passed; exit 1 |
| npm run test:unit after evaluator | 12 passed; exit 0 |
| Build + decision.test.js with retrieval stub | Failed assert.ok(draft); exit 1 |
| Build + decision.test.js after retrieval/approval | Failed assert.ok(denied) at missing event processing; exit 1 |
| Build + decision.test.js after transaction | 1 passed; exit 0 |
| Initial npm run test:integration with plain event INSERT | 4 passed, replay failed with events_pkey duplicate; exit 1 |
| npm run test:integration after ON CONFLICT/replay handling | 5 passed; exit 0 |
| Initial backend restart test with route stub | Expected 200, received 503; exit 1 |
| Initial validation test before domain tool registration | Method not found; exit 1 |
| Integration run after backend/client implementation | 6 passed; Host-header test got 401 instead of 403; exit 1 |
| Focused validation after correcting test HTTP client | 1 passed; exit 0. fetch normalized Host, so node:http now sends the actual forged header; production guard unchanged |
| npm run db:migrate | Exit 0; migration 1 applied/verified on dedicated development DB |
| npm run db:seed | Exit 0; seeded simulated devices and draft, no automatic approval |
| Final npm run test:unit | **12 passed, 0 failed, 0 skipped; exit 0** |
| Final npm run test:integration | **7 passed, 0 failed, 0 skipped; exit 0**; negotiated MCP 2025-11-25 |
| Final npm run typecheck | **Exit 0**, no TypeScript errors |

Rollback and unlock integration tests passed when first added because the
transaction/policy already implemented those behaviors; no separate red cycle is
claimed for them. No test results were inferred from expected outputs.

### Acceptance evidence and limits

- AC-01: official SDK initializes/discovers/calls across an OS process boundary;
  real backend routes call a separately running MCP server with no DB URL in the
  web child process's environment.
- AC-02/03: unapproved event is stored as denial; explicit approval does not
  execute; a fresh matching event commits one receipt and changes porch state.
- AC-04/05: sequential normalized replay and ten concurrent duplicate requests,
  both DB-level and through web/MCP, return one decision and one receipt per event;
  changed payload returns conflict. PostgreSQL uniqueness enforces the event key.
- AC-06/08: stop/restart both web and MCP without reseeding; GET retrieves exactly
  the previous evidence, replay creates no receipt; MCP down returns 503 without
  writing an action, then retry after recovery succeeds.
- AC-07: weekday/timezone, before/equal sunset, unavailable sunset and trigger
  mismatch rules covered by literal unit cases.
- AC-09: SQL trigger rejecting action INSERT rolls back event/decision/device
  changes; removing the trigger allows retry. Actual mid-request DB-service outage
  was not separately injected.
- AC-10: nonexistent ID has no invented history; evidence survives routine-head
  replacement and process restart, with original approval/policy/action snapshots.
- AC-15: forged approval and malformed time rejected through SDK; invalid action
  pair rejected by schema; token, Origin, Host, CSRF and body-size boundaries tested.
- Unlock prototype guarantee: approved unlock fixture produces durable denial,
  zero receipts and locked state; direct DB unlock update violates a constraint.
  This does not implement M2 proposal creation or editing.

Remaining scope/risks: full frontend and browser tests NOT RUN; M2 proposals and
M3 demo NOT IMPLEMENTED; database-container restart with a saved decision NOT
TESTED; Bedrock/native Alexa+/real devices NOT INTEGRATED. Local single-operator
security only. No full clean-machine setup or publication was attempted. Changes
are uncommitted; no remote is configured. No remaining blocker to the requested
backend definition of done was observed.

## Future result entry format

Record milestone, date, changed files, acceptance IDs, exact command, runtime and
DB versions, exit code, pass/fail/skip counts, intended red failure, green result,
and remaining blockers. Preserve failure evidence; never replace it with expected
output. Redact credentials. Log protocol version and decision IDs for M1 onward.


## Seeded UI + Render preparation (2026-10-22)

Backend checkpoint e7c6708 committed after secrets/generated-file scan. Before UI
changes: unit 12/12, integration 7/7, typecheck exit 0, all executed.

New TDD observations:
- workspace test: intended red GET /api/home returned 404; green 1/1 after read
  tools, seed and web routing. Independent SQL observer saw one action receipt.
- browser test: intended red missing Approve routine button; green 1/1 after UI.
  Real Edge browser, actual web/MCP processes and PostgreSQL, no protocol mocks.
- hosting test: intended red configured hosted health returned 403; green 1/1
  after PORT/bind, exact hosted origin and health adaptations.

Full regression after hosting changes:
- npm run test:unit: 12 passed, 0 failed/skipped.
- npm run test:integration: 9 passed, 0 failed/skipped; MCP 2025-11-25 negotiated.
- npm run test:e2e: 1 passed, 0 failed/skipped. Explicit approval, porch on,
  locked door, approved unlock denial, replay (SQL action count remains 1),
  refresh retrieves two decisions, evidence inspection, 390px no horizontal
  overflow, MCP stopped and visible unavailable state; no page JS errors.
- npm run typecheck: exit 0.
- Visually inspected test-results/desktop.png (1440x1000 viewport, full page)
  and mobile.png (390x844 viewport, full page). No overlap or truncated evidence;
  mobile stacks controls and wraps IDs. Full accessibility review still pending.

Changed files: public/index.html, public/style.css, public/app.js,
src/contracts.ts, src/fixtures.ts, src/mcp-server.ts, src/web.ts,
src/mcp-http.ts, src/mcp-client.ts, package.json, package-lock.json,
tests/integration/workspace.test.ts, tests/integration/hosting.test.ts,
tests/e2e/demo.test.ts, render.yaml, AGENTS.md, README.md and project docs.

Render account menu verified aayushkumbharkar53@gmail.com. No Render resources
created yet. Blueprint references generated secret and internal PostgreSQL URL;
public MCP service uses bearer auth. Hosted workflow NOT RUN. Railway abandoned.

## Live flow and focused redesign — 2026-10-23

Before redesign or disruption, scripts/hosted-browser.mjs completed the live
browser flow on homerelay-web.onrender.com: unapproved draft, explicit approval,
arrival execution, locked door, approved unlock denial, original-event replay,
refresh and original evidence. Zero browser JS errors. Screenshots and the actual
recording are in test-results/hosted (local artifacts, excluded from Git).

An independent scripts/hosted-smoke.mjs flow initially returned 503 while the free
MCP service woke. A direct /healthz request subsequently returned 200 and repeating
flow passed approval, execution, denial, original receipt replay and retrieval.
This was an observed cold-start recovery, not a silent passing first attempt.
Public MCP without bearer returned 401; database health returned 200.

Render resources: homerelay-web (srv-dbcsrvjncjis73dhq5p0), homerelay-mcp
(srv-dbcsrfjncjis73dhokpg), homerelay-db (dpg-dbcsqv3ncjis73dhmtr0-a), Oregon.
Both web services reported Live at eef3cde; actual logs showed npm ci/build and
MCP migration/seed startup succeeding. Account was verified as
 aayushkumbharkar53@gmail.com before provisioning. No secret copied into source/UI.

Redesign TDD: browser assertion first failed on missing requested headline.
After focused public HTML/CSS/JS edits, test passes requested headline/action
within 1440x1000 viewport, neutral current-visit state after reload, readable
explanation and collapsed Technical evidence. Desktop/mobile captures inspected.
No backend policy/schema changes. Log lines now accurately report configured bind
address instead of a hardcoded loopback label.

Final local regression after redesign:
- npm run test:unit — 12 pass, 0 fail/skip.
- npm run test:integration — 9 pass, 0 fail/skip.
- npm run test:e2e — 1 pass, 0 fail/skip; includes real MCP stop/restart, refreshed
  connection recovery and unchanged SQL receipt count, keyboard skip/dialog focus.
- npm run typecheck — exit 0.
- git diff --check — exit 0 (line-ending notices only).

New deployment/restart verification of this redesigned commit remains pending
until recorded below. Public video and Devpost final submission are not yet done.

## Time Machine milestone — 2026-10-23

Scope: incident reconstruction, side-effect-free counterfactual preflight, three new
MCP tools, migration 002 (`preflight_runs`), workbench UI. No Render config change.
Baseline before changes: unit 12/12, integration 9/9 (executed).

Changed files: src/contracts.ts, src/policy.ts, src/decisions.ts, src/fixtures.ts,
src/db.ts, src/mcp-server.ts, src/web.ts, src/preflight.ts (new), src/incident.ts
(new), db/002-preflight-runs.sql (new), .gitattributes (new), scripts/migrate.ts,
scripts/hosted-smoke.mjs, public/index.html, public/app.js, public/style.css,
tests/helpers/database.ts, tests/unit/preflight.test.ts (new),
tests/integration/migration.test.ts (new), tests/integration/preflight.test.ts (new),
tests/e2e/timemachine.test.ts (new), tests/e2e/demo.test.ts, README.md and docs.

TDD observations:
- unit/preflight.test.ts: intended red with stub modules: 7 failed (stub output
  rejected by PreflightSuiteSchema/IncidentSchema; CHECK_ORDER precedence assertion
  failed). Green: 20/20 unit after implementation.
- integration/migration.test.ts: intended red "MCP started on an unmigrated schema"
  (old v1-only startup check). An earlier red attempt hung because the leaked child
  process was not stopped; the test was fixed to stop it, then re-observed red.
- integration/preflight.test.ts: intended red "run_preflight has typed schemas"
  (tool absent). Both green after migration, tools and routes.
- e2e/timemachine.test.ts was written after the UI markup; no red was observed for
  it. First run failed on an ambiguous test locator and the existing demo e2e caught
  a real 390px overflow caused by a `.safety` class collision; renamed to `.risk`.
- Saturday sunset fixture 2026-10-24 17:58 added explicitly. Existing Mon–Fri
  routines are unaffected because the weekday check precedes the sunset check.

Final local regression (all executed, Node 24.22.0, PostgreSQL 18 Docker):
- npm run test:unit — 20 pass, 0 fail/skip.
- npm run test:integration — 11 pass, 0 fail/skip; MCP 2025-11-25 negotiated.
- npm run test:e2e — 2 pass, 0 fail/skip (real Edge, web+MCP processes, PostgreSQL).
- npm run typecheck — exit 0.  git diff --check — exit 0.
- Local dev DB migrated with npm run db:migrate (v1 -> v2); MCP then started.
- Inspected test-results/timemachine-fixture.png, timemachine-pass.png (1440x1000:
  incident, candidate, invariants, run button and all six result rows in first
  viewport), timemachine-desktop.png and timemachine-mobile.png (390px, no overflow).

Known limitations: fixed six-case suite on dated fixtures; preflight `currentRevision`
is simulated as true; a passing run cannot be activated (no revision creation);
preflight runs are public and unthrottled in the shared demo; the UI's "device state
unchanged" is an observation of before/after reads in a shared household, while the
authoritative no-side-effect proof is the integration test's table comparison.

Deployment: see the next entry.

## Time Machine deployment — 2026-10-23

Commit 9a5c8e0 pushed to codex/m1-vertical-slice (Render auto-deploy). The push used
the repository owner's gh account; the machine's default credential was refused (403).
No Render configuration change. Render dashboard/deploy logs were not inspected (no
Render CLI/API access in this session); the evidence below is external behaviour.

- Web served the new page at 03:36 IST. MCP rollover was observed later: a poll of
  GET /api/preflight/<absent uuid> returned 503 (old MCP lacks the tool; no
  fallback) through 10:15:54, then 404 NOT_FOUND from the new MCP by ~10:17. The
  machine slept during the poll, so the exact rollover time is unknown.
- The new MCP refuses to start below schema v2, so serving reconstruct_incident and
  get_preflight_run implies migration 002 was applied to the live database.
- `SMOKE_URL=https://homerelay-web.onrender.com node scripts/hosted-smoke.mjs preflight`
  (first attempt 503 during rollover, recorded above; rerun) PASS: run
  12558a02-e364-43d9-ae37-08dde54a63a5 changed only saturday-after-sunset, 0
  violations; unlock candidate failed PROHIBITED_ACTION_REQUESTED with all unlocks
  denied; /api/home and /api/history identical before/after; saved run retrieved
  identically; forged `approved` field rejected with 400.
  It also recorded one simulated Saturday arrival in the shared household (event
  baefd4a0-2a2a-4402-bd15-792a20c79d09): stored OUTSIDE_WEEKDAYS, no receipt; its
  reconstruction equals the stored decision. This is the live page's incident.
- Live real-browser check (temporary script, Edge, 1440x1000): new headline, incident
  "Recorded · PostgreSQL" with verified root cause OUTSIDE_WEEKDAYS, Run preflight
  suite -> PASS, 1 of 6 changed, 5 invariants held, device state unchanged, 0 JS
  errors (run 4953c67f-6f40-400c-bf8f-e4469fbb92a4). Screenshot:
  test-results/hosted/timemachine-live.png (local artifact).
- `hosted-smoke.mjs flow` PASS after release: approval, real-MCP execution, unlock
  denial, original-receipt replay and persisted retrieval still work live.

Observed limitation: with a recorded incident the incident card is taller, so at
1440x1000 only about three result rows are above the fold (all six with the fixture).
Not run live: restart recovery of a saved run (tested locally only), MCP outage.

## First-viewport fix — 2026-10-23

Live check showed only ~3 of 6 comparison rows above the fold once a recorded
incident is displayed. TDD: browser assertion added for the recorded state. A first
version wrongly passed because reload restored scroll position (viewport-relative
box); it was corrected to document coordinates. Intended red: last row ended at
1131px (cards 353px, suite 443px). Fix: check trace rendered as compact chips (per-check
evidence kept for screen readers and hover; failed evidence remains in the root
cause box), receipt/decision lines merged, weekday toggles on one row, tighter suite
header. An intermediate step overrode the mobile single-column grid; the existing
390px overflow assertion caught it, fixed by scoping to min-width 1101px.
Green: last row within 1000px. Inspected test-results/timemachine-recorded.png and
timemachine-mobile.png.

Regression after fix (executed): unit 20/20; integration 11/11; e2e 2/2;
typecheck exit 0; git diff --check exit 0.

Live after pushing 65edf53 (new stylesheet observed on homerelay-web): temporary
real-browser check (Edge, 1440x1000) PASS: incident "Recorded · PostgreSQL" (Sat 24
Oct arrival, no action), Run preflight suite -> PASS 1 of 6 changed, 5 invariants
held, last comparison row ends at 998px (within first viewport), no overflow at
390px, device state unchanged, 0 JS errors. API smoke not re-run, to avoid adding
another simulated event to the shared household; run_preflight was exercised live
through the browser path.

## Final layout fit and cold-load state — 2026-10-23

Intended reds (executed): recorded-incident assertion tightened to <=945px failed at
998px; new outage assertion failed because a cold page load during an MCP outage left
the incident badge at "Loading" indefinitely (observed live during a free-tier wake).
The viewport test resets scroll, asserts scrollY=0 and measures document coordinates,
so a reload-restored scroll position cannot pass it falsely.

Minimal fix (no text size reduced): one-line intro copy, reason code inline in the
root-cause box, table cell padding 5->4px, two section gaps -4/-2px; on a failed
load the incident panel reads "Unavailable" and shows no incident rather than a guess.

Green (executed): recorded incident last row 934px; long root-cause text (test-only
browser substitution of the evidence string, incl. a 64-char token) 967px, contained
in the card, no overflow at 1440 or 390px; existing 390x844 test unchanged and passing.
Regression: unit 20/20; integration 11/11 (MCP 2025-11-25); e2e 2/2; typecheck 0;
git diff --check 0. Inspected timemachine-recorded.png, timemachine-long-cause.png,
timemachine-long-cause-mobile.png (cropped: token wraps inside the box).

## Final release — 2026-10-23

Pre-push: outgoing diff (0fb12e3 + c6ed032) inspected file by file; secret patterns
scanned in the outgoing diff and the full tracked tree (none). GitHub identity verified
via `gh api user` as aayushkumbharkar with push=true before pushing 65edf53..c6ed032;
active account restored to aayush835 afterwards. Repository visibility: public.

Render: new stylesheet served and get_preflight_run answered 404 (absent ID) at the
first poll after the push. Live real-browser verification (temporary script, Edge):
- stored incident equals the persisted decision 112af6a7-8a01-436e-9cd7-9d1a4bd17cd0
  (GET /api/incidents vs /api/decisions), root cause OUTSIDE_WEEKDAYS shown;
- six cases: weekday ALLOW/ALLOW, Saturday DENY OUTSIDE_WEEKDAYS -> ALLOW, before
  sunset, missing sunset, unapproved, unlock DENY on both sides; PASS 1 of 6 changed,
  0 violations, 5 invariants held; last row 934px;
- unlock-bypass candidate: FAIL PROHIBITED_ACTION_REQUESTED, 5 unlock verdicts all
  DENY DOOR_UNLOCK_FORBIDDEN, 0 violation rows;
- devices and history unchanged; 390px single column, no overflow; 0 JS errors.

Demo video: recorded from the live deployment with Playwright (1440x810 -> 1920x1080,
H.264/AAC), synthesized English narration. ffprobe duration 153.67s (2:34). First
attempt rejected after frame review (page rendered top-left with padding). Upload,
public URL and anonymous playback: NOT YET DONE (requires the account holder).
Devpost submission: NOT YET DONE.

## Live loading failure: diagnosis and fix — 2026-10-23

Reproduction (read-only, live, 12:51 IST): web /healthz 200 in 0.8s and /api/session
200, but /api/routines/r1, /api/home, /api/history all 503 {"error":"UNAVAILABLE"}
(application/json) in 0.4-0.9s. MCP /healthz took 21.5s on first call, then 0.8s;
POST /mcp without a token returned 401 (auth enforced). With MCP awake the same three
reads returned 200 JSON in 0.5-1.1s. A probe after 17 minutes idle (13:09) showed a
sleeping MCP holds a request 22.9s at Render's edge before answering.
Root cause: (1) transient trigger, free-tier MCP asleep; no deployment, database,
migration or credential fault found; (2) defect, refresh() used Promise.all over
session+routine+home+history, so any rejection skipped every later UI update and left
all sections at Loading/Unknown with no automatic recovery; api() also called
response.json() unconditionally (an HTML error page would raise SyntaxError); and
callMcp mapped MCP 401/403 to UNAVAILABLE, making a token mismatch look like a wake-up.
Not observed: why the Render-to-Render call failed in <1s rather than at the 5s client
timeout (Render runtime logs not accessible in this session).

Fix: web GET /api/ready (one read-only web->MCP->PostgreSQL call; body has no token or
internal URL); /healthz states it checks process liveness only; MCP 401/403 ->
UPSTREAM_REJECTED (502). Frontend: session first, then one readiness probe at a time
with bounded backoff (8 attempts, 2-20s delays, then stop with a manual retry); routine,
home, history and incident load independently; failed sections show Unavailable / Not
loaded (never assumed states) with a per-section Retry; previously loaded data marked
Stale with its retrieval time; non-JSON responses handled as service errors; 20s
request timeout; refreshes cannot overlap; mutations are never auto-retried and the
arrival retry reuses its pending event ID.

TDD (executed): intended reds: readiness 404; one HTML-503 read left the routine at
"Loading" (the reported symptom); no connecting state; zero readiness probes; no
configuration message. Existing demo outage step updated to assert the new waking state
and fast-forward the bounded retries (all prior assertions kept).
Green: unit 20/20; integration 12/12 (MCP 2025-11-25); e2e 7/7; typecheck 0;
git diff --check 0.

Live after push c6ed032..ceab69b (identity verified aayushkumbharkar, push=true):
new app.js served and GET /api/ready 200 at 13:11:49 IST. README on GitHub verified
byte-identical to HEAD at ceab69b063f225ff5f0c7f63f03a42516980c4ce.
- Warm browser run (Edge, 1440x1000): request order session -> one /api/ready ->
  routine/home/history in parallel -> incident; all sections settled in 5.3s, none
  stuck; three rapid Refresh clicks produced one readiness request; labelled preflight
  run 9bc67211-ac25-4eea-a6e6-4c2993accc4f PASS (1 of 6 changed, 0 violations; writes
  one test-run record); no overflow at 390px; 0 JS errors.
- "Idle" run after 17 minutes (13:29): settled in 4.9s, first readiness probe
  succeeded, refresh x3 -> one readiness request, 0 JS errors. This did NOT exercise a
  cold start: saved decisions rose from 29 to 32 during the window (other visitors),
  so the services stayed awake. Live wake-up recovery is therefore NOT verified; it is
  verified locally (e2e: MCP stopped on first load, then started; recovery without
  reload) and by the bounded-retry e2e test.
