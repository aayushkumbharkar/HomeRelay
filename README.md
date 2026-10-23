# HomeRelay Time Machine

**Replay the incident. Test the fix. Block regressions.**

A counterfactual debugging and regression-testing workbench for MCP-powered household
automations. Built for the Amazon Developer Hackathon (Alexa+ primary track,
simulated web-experience path).

- **Live app:** https://homerelay-opal.vercel.app (Vercel + Neon PostgreSQL)
- **Repository:** https://github.com/aayushkumbharkar/HomeRelay
- **MCP endpoint:** https://homerelay-opal.vercel.app/mcp (Streamable HTTP, server-held bearer token; requests without it get 401)
- **Fallback:** the earlier Render deployment, https://homerelay-web.onrender.com, is kept only as a rollback (see [why it was replaced](docs/vercel-deployment.md#why-render-was-replaced))

> Every device and event is simulated. There is no runtime LLM, no native Alexa+
> connection, no Bedrock and no physical device. Results come from stored evidence
> or a deterministic policy engine.

## The problem

When a home automation does the wrong thing, a developer needs two answers before
changing it: *why did it decide that?* and *what else would my fix change?*
Re-running the automation to find out can execute real actions, and editing the rule
and hoping can silently weaken a safety boundary. HomeRelay answers both questions
from recorded evidence and a side-effect-free test suite, before anything is approved.

## How the demo works

1. **Reconstruct a recorded incident.** The incident panel rebuilds a saved decision
   (for example, a Saturday arrival the weekday-only routine refused) from the
   snapshots stored in PostgreSQL. The recorded reason code locates the failed policy
   check; earlier checks show as passed, later ones as not reached, each citing stored
   evidence. If no such record exists, the panel is labelled
   **Scenario fixture · not recorded** and the root cause is marked unverified.
2. **Propose a candidate.** Toggle the schedule's weekdays (Saturday is pre-selected)
   and optionally request a front-door unlock to simulate a bypass attempt. The diff
   shows exactly what changes.
3. **Run the six-case preflight suite** through the real MCP server
   (`run_preflight`).
4. **Compare baseline and candidate** decisions and reason codes for each case.
5. **Check the safety invariants:** door unlock is always denied, an unapproved
   routine never executes, missing or early sunset evidence means no action.
6. **Retrieve saved preflight evidence** (`get_preflight_run`).

Candidates are **never activated, approved or applied to devices**. Preflight uses a
labelled *simulated* approval (`preflight-simulation`, never persisted) that is
reported separately from the routine's real approval. Preflight writes only its own
test-run record: no event, decision, action, approval, routine or device row.

Below the workbench, the original live household flow still works: explicit approval
of the exact routine revision, a simulated arrival that turns on the porch light, an
approved unlock request that is still denied, and idempotent replay of the same event.

## Features

- **Evidence-backed incident reconstruction** from stored decision snapshots
  (`reconstruct_incident`); nothing is recomputed as historical truth.
- **Counterfactual policy evaluation** with the production `evaluate()` function,
  without the event-processing path.
- **Six fixed preflight cases:** approved weekday arrival after sunset, Saturday
  arrival after sunset, arrival before sunset, missing sunset evidence, unapproved
  routine, prohibited door unlock.
- **Baseline-versus-candidate comparison** with change classification (unchanged,
  newly allowed, newly denied, reason changed).
- **Safety invariant checking.** A candidate requesting a prohibited action, or one
  that denies a previously allowed case, fails the suite.
- **Persistent saved preflight runs** (insert-only table, additive checksummed migration).
- **Official MCP client and server** (TypeScript SDK v2) over Streamable HTTP;
  negotiated protocol **2025-11-25** in tests.
- **PostgreSQL persistence and event idempotency.** One transaction stores the event,
  decision snapshots, simulated device change and action receipt; unique keys prevent
  duplicate actions across retries, ten concurrent replays and restarts.
- **Honest handling of service failures.** Each section loads independently, shows
  only data actually retrieved, and offers its own Retry; wake-ups are retried a
  bounded number of times; configuration errors are reported, not retried.

## Architecture

```text
Browser ──► web API (Node handler) ──► official MCP client
                                            │  HTTPS Streamable HTTP + bearer token
                                            ▼
                     stateless MCP endpoint (official SDK, fresh server per request)
                                            │
                              ┌─────────────┴──────────────┐
                              ▼                            ▼
                deterministic policy engine          PostgreSQL
```

Hosted, both handlers run in **one Vercel deployment** as two Node.js 24 functions,
`api/web` and `api/mcp`, with static assets on Vercel's CDN and data in **Neon
PostgreSQL 18**. The web function still calls the MCP function over HTTPS with the
official client; it never touches the database or policy itself. Locally, the same
handlers run as two Node listeners. All persistent state (approvals, events,
decisions, action receipts, simulated devices, preflight runs) lives in PostgreSQL;
nothing is kept in function memory or local files.

The browser holds no MCP token, database connection or policy code, and cannot
bypass the web backend. The web backend has no database or policy imports; if MCP is
down it reports the outage and never falls back to local logic. Mutating routes
require same-origin requests and a CSRF token; MCP checks Host/Origin and the bearer
token and caps request bodies at 16 KiB.

| Route | Purpose |
| --- | --- |
| `GET /healthz` (web) | Process liveness only, and says so |
| `GET /api/ready` (web) | End-to-end read-only check: web → MCP → PostgreSQL |
| `GET /healthz` (local MCP listener) | MCP process plus a PostgreSQL query |

More detail: [architecture](docs/architecture.md), [acceptance tests](docs/acceptance-tests.md),
[risks](docs/risks.md).

## Quick start (local)

**Prerequisites:** npm with a bootstrap Node.js 20 or newer, Docker Desktop, and
Microsoft Edge (used by the browser tests). `npm ci` installs the project's pinned
Node.js 24.22.0, which the npm scripts use.

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env`: replace every placeholder with a random secret, and use the same
PostgreSQL password in `POSTGRES_PASSWORD`, `DATABASE_URL` and `TEST_DATABASE_URL`.
`MCP_TOKEN` must be at least 32 characters. Never commit `.env`. If you already have
a `.env`, keep it.

Start PostgreSQL 18 (loopback port 15432, named volume `homerelay-data`), then create
the test database **once**:

```powershell
docker compose up -d --wait
docker compose exec -T db psql -U homerelay -d homerelay -c 'CREATE DATABASE homerelay_test;'
```

The test database name must end in `_test`; tests refuse anything else and work in
disposable per-test schemas inside it, so they never touch your demo data.

Apply migrations and seed the simulated household (both are safe to repeat: migrations
are checksummed under an advisory lock, and the seed never resets existing approvals,
decisions or device state):

```powershell
npm run db:migrate
npm run db:seed
```

Run the two services in separate terminals:

```powershell
npm run start:mcp   # http://127.0.0.1:3001/mcp
npm run start:web   # http://127.0.0.1:3000
```

Open http://127.0.0.1:3000. If `npm run start:mcp` prints *MCP startup failed; check
database, migrations, token and port*, make sure PostgreSQL is running, run
`npm run db:migrate`, and check `MCP_TOKEN` length. To restart cleanly, stop and start the services or
`docker compose restart db`; **do not delete the database volume**, which holds the
household's history.

### Environment variables

| Name | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Local Docker database password (secret) |
| `DATABASE_URL` | PostgreSQL connection for MCP, migrations and seed (secret) |
| `TEST_DATABASE_URL` | Dedicated test database; name must end in `_test` (secret) |
| `MCP_TOKEN` | Shared web↔MCP bearer secret, at least 32 characters (secret) |
| `MCP_URL` | Full local MCP endpoint including `/mcp` |
| `MCP_PORT` / `WEB_PORT` | Local ports, defaults 3001 / 3000 |
| `CSRF_SECRET` | Vercel only: HMAC key so any function instance accepts the CSRF token (secret) |
| `PG_POOL_MAX` / `PG_CONNECT_TIMEOUT_MS` / `MCP_TIMEOUT_MS` | Optional tuning; defaults 12 / 2000 ms / 5000 ms. Vercel uses 2 / 15000 / 20000 |
| `PUBLIC_HOSTS` | Optional extra allowed hosts (comma-separated); Vercel's own hosts are added automatically |
| `MCP_BASE_URL`, `PORT`, `BIND_HOST`, `RENDER_EXTERNAL_URL`, `NODE_VERSION` | Render fallback settings, see [render.yaml](render.yaml) |
| `SMOKE_URL` | Explicit HTTPS target for the hosted verification scripts |

## Deploying to Vercel + Neon

`npm run build:vercel` compiles TypeScript and writes Vercel's Build Output API
(`.vercel/output`: static assets plus the `api/web` and `api/mcp` functions with only
production dependencies). [vercel.json](vercel.json) runs it on Vercel, and
[.vercelignore](.vercelignore) keeps `.env*`, `.local/` and build artefacts out of
uploads. Migrations are an explicit step, never run per request: point a git-ignored
env file at the Neon **direct** connection string and run
`node --env-file=<file> dist/scripts/migrate.js`, then `dist/scripts/seed.js`.
Environment variables, the Neon timeout settings and why the direct (not pooled)
endpoint is used are in [Vercel deployment](docs/vercel-deployment.md).

## Testing

```powershell
npm run test:unit         # 20 tests
npm run test:integration  # 13 tests
npm run test:e2e          # 7 tests (real Microsoft Edge)
npm run typecheck
git diff --check
```

Counts are from the latest executed run, recorded in [verification](docs/verification.md).

- **Unit:** every policy reason code and its precedence (pinned to the exported
  check order), strict schemas rejecting forged `approved` fields, the preflight
  suite (Saturday changes only the Saturday case; daytime, missing-sunset,
  unapproved and unlock cases stay denied; unlock bypass and weekday removal fail),
  and incident reconstruction from stored reason codes.
- **Integration** (real PostgreSQL, separate web and MCP processes over TCP, no
  protocol mocks): approval, execution and denial; ten concurrent duplicate events
  committing one action; idempotency conflicts; transaction rollback; restart
  recovery; MCP outage with no fallback; input, origin, token and body-size
  boundaries; hosted configuration; migration upgrade of a populated database and
  refusal to start on an old schema; preflight leaving seven domain tables unchanged
  and surviving restart; readiness distinguishing an outage (503) from rejected MCP
  credentials (502) without exposing secrets; and the packaged Vercel functions
  (`npm run build:vercel` output) running the whole workflow, stateless across two
  instances, with an unreachable database failing fast.
- **Browser** (real Edge against real services in a disposable schema): the full
  household flow, keyboard focus and dialogs; the Time Machine workflow and its
  first-viewport layout at 1440×1000 and 390×844; one failed read (including a non-JSON
  HTML error page) leaving other sections usable with keyboard-operable Retry; MCP down
  on first load then recovering without a reload; bounded retries that stop with a
  clear message; configuration errors without retry loops; overlapping refreshes
  collapsing to one; and actions appearing successful only after the backend confirms,
  with a retry reusing the same event ID.

`npm run test:mcp` is a database-free official-SDK transport proof. No test silently
skips a missing service: without `TEST_DATABASE_URL` (ending in `_test`) or a running
PostgreSQL, the database-backed tests fail.

## Live demo and troubleshooting

The hosted demo runs on free plans: Vercel functions start cold after idle periods,
and Neon's free compute suspends when idle and resumes on the next query. The first
request after a quiet period is therefore slower than later ones; the page waits for
one end-to-end readiness check before loading sections, and retries it with backoff.
Measured on 23 October 2026 with Neon confirmed suspended: the first readiness check
took about 2.3 s and a warm one about 1 s; a full page load showed every section in
under 5 s without needing a retry. These are single measurements, not guarantees.

| You see | What it means | What to do |
| --- | --- | --- |
| **Connecting… / MCP service may be waking (attempt n of 8)** | The page is checking web → MCP → PostgreSQL, one request at a time, with backoff | Wait; it recovers by itself without reloading |
| A section says **Unavailable**, **Not loaded** or **Stale** with a **Retry** button | That read failed; other sections show only data actually retrieved | Select that section's Retry |
| **Incident evidence unavailable** | The incident or saved history could not be read, so no incident is shown rather than a guess | Retry the incident, or Refresh evidence |
| **The MCP service is unavailable: could not reach it after 8 attempts** | Retries stopped (~1 minute of backoff); likely still waking or a real outage | Select **Refresh evidence** once; if it fails again, report it |
| **Configuration problem** | The web service's MCP credentials were rejected; this is a deployment error, not a wake-up | Retrying will not help; report it |
| Sections **Unavailable** while the connection works | The database is unreachable; reads fail closed with `UNAVAILABLE` and nothing is invented | Retry once; if it persists, report it |

A transient cold start recovers after one wait. A failure that persists after a
manual retry points to a deployment, database or configuration problem and should be
reported rather than waited out.

This is **one shared, simulated household**: other visitors may already have approved
the routine or turned the light on, and the incident shown may have been recorded by an
earlier visitor or verification run. Do not enter personal information.

Deployment details: [Vercel + Neon](docs/vercel-deployment.md) (current) and
[Render](docs/render-deployment.md) (fallback).

## Honest limitations

- No runtime LLM and no natural-language parsing; routines are seeded.
- No native Alexa+ device connection; this follows the hackathon's simulated
  web-experience path with a self-hosted MCP server.
- No physical Ring, smart-lock or other device control.
- No Amazon Bedrock integration and no AWS runtime API.
- The preflight suite is a fixed set of six cases on dated simulation fixtures
  (sunset fixtures exist for 21 and 24 October 2026 only), and candidates can change
  only weekdays and actions.
- A passing preflight does not activate the candidate; turning it into a new routine
  revision for explicit approval is not implemented.
- No production identity or multi-user household isolation; saved preflight runs are
  public and not rate-limited in the shared demo.
- Hosting uses free plans (Vercel Hobby, Neon Free): cold starts after idle periods
  are not eliminated. Vercel's Hobby plan is limited to personal, non-commercial use;
  whether a cash-prize hackathon entry qualifies is ambiguous and has not been
  confirmed with Vercel (see [Vercel deployment](docs/vercel-deployment.md#eligibility-and-cost)).
- The Render fallback's free PostgreSQL database has a limited lifetime (30 days) with
  no backups.

No AWS mini-challenge eligibility and no Amazon API feedback are claimed.

## Documentation

- [Verification ledger](docs/verification.md): every executed command and result
- [Acceptance tests](docs/acceptance-tests.md) and [architecture](docs/architecture.md)
- [Demo script, as recorded](docs/demo-script.md)
- [Product feedback and friction log](docs/product-feedback.md)
- [Submission draft](docs/submission.md)

A public demo video link will be added here once it is published and its playback
verified.

MIT licensed. See [LICENSE](LICENSE).
