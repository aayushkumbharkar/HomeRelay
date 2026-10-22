# HomeRelay

A policy-aware household assistant planned for the Amazon Developer Hackathon,
Alexa+ primary track. Devices and home events are simulated.

**Status: first backend vertical slice implemented.** A web API calls a separate
self-hosted MCP service using the official SDK. PostgreSQL stores approvals,
policy decisions, simulated device state and action receipts atomically. No
frontend, natural-language parser, Bedrock, native Alexa+ or real devices exist.

- [Project specification](docs/superpowers/specs/2026-10-22-homerelay-design.md)
- [Architecture](docs/architecture.md)
- [Acceptance test specification](docs/acceptance-tests.md)
- [Smallest vertical slice and milestone plan](docs/superpowers/plans/2026-10-22-homerelay-vertical-slice.md)
- [Risks and blockers](docs/risks.md)
- [Environment inspection and actual verification results](docs/verification.md)
- [Official sources](docs/sources.md)

## Local setup

Run from the repository root. Prerequisites: npm with a bootstrap Node >=20 and
working Docker Desktop. `npm ci` installs pinned dependencies including a
project-local Node 24; npm scripts use that runtime without changing system Node.

```powershell
npm ci
Copy-Item .env.example .env
```

If `.env` already exists, keep it. Replace the password/token placeholders with
random secrets; use the same DB password in POSTGRES_PASSWORD and both URLs.
Never print or commit `.env`. Docker PostgreSQL uses loopback port **15432**;
55432 is reserved on the inspected Windows machine. The existing host PostgreSQL
on 5432 is not used or modified. For another instance, configure the two URLs
instead; the dedicated test database name must end in `_test`.

```powershell
docker compose up -d --wait
docker compose exec -T db psql -U homerelay -d homerelay -c 'CREATE DATABASE homerelay_test;'
npm run db:migrate
npm run db:seed
npm run build
```

Create the test database once; an “already exists” response means retain it.
Migrations are versioned/checksummed and transactional. Seeding never resets an
approval, device or decision. Tests create and remove uniquely named schemas only
inside the explicit test DB. PostgreSQL uses a named volume; do not delete it to
test persistence.

Start these in separate terminals:

```powershell
npm run start:mcp
npm run start:web
```

Default web API: `http://127.0.0.1:3000`; MCP endpoint:
`http://127.0.0.1:3001/mcp`. The root page is intentionally not implemented.
The MCP bearer token stays on the server. Only MCP receives database access in
the automated process tests; the web module has no database/policy imports.

## Explicit approval and simulated arrival

PowerShell example; each POST is a separate explicit operator action. Inspect
the seeded draft before approving. The date and sunset are fixed simulation
fixtures, independent of today's clock.

```powershell
$relayBase = 'http://127.0.0.1:3000'
$relaySession = Invoke-RestMethod "$relayBase/api/session"
$relayHeaders = @{ Origin = $relayBase; 'X-CSRF-Token' = $relaySession.csrfToken }
$relayDraft = Invoke-RestMethod "$relayBase/api/routines/r1"
$relayDraft.routine

# Execute only after reviewing the displayed draft:
$relayApproval = @{ routineRevisionId = 'r1'; contentHash = $relayDraft.contentHash } | ConvertTo-Json
Invoke-RestMethod "$relayBase/api/approve" -Method Post -Headers $relayHeaders -ContentType 'application/json' -Body $relayApproval

$relayEvent = @{ eventId = 'arrival-001'; routineRevisionId = 'r1'; kind = 'arrival'; occurredAt = '2026-10-21T19:00:00+05:30'; source = 'simulated' } | ConvertTo-Json
$relayResult = Invoke-RestMethod "$relayBase/api/events" -Method Post -Headers $relayHeaders -ContentType 'application/json' -Body $relayEvent
$relayResult | ConvertTo-Json -Depth 12

# Replay exactly the same event; same decision, no new receipt:
Invoke-RestMethod "$relayBase/api/events" -Method Post -Headers $relayHeaders -ContentType 'application/json' -Body $relayEvent
Invoke-RestMethod "$relayBase/api/decisions/arrival-001"
```

Stop and restart both Node services, then GET that decision again; do not reseed
or delete the volume. Fetch a new `/api/session` token before new POSTs after a
web restart. A reused event ID with different normalized input returns 409.
Before approval, a new event persists an APPROVAL_REQUIRED denial. Denied events
remain denied on replay; use a fresh event ID after approving.

The prototype never unlocks a door. Its policy, simulated adapter and database
constraints prevent an unlock action. The integration test creates an approved
unlock fixture in an isolated schema to prove that denial; no unlock UI or real
lock command exists.

## Verification

```powershell
npm run test:mcp
npm run test:unit
npm run test:integration
npm run typecheck
```

MCP proof runs without PostgreSQL; integration tests require the test DB. Tests
fail rather than silently skip missing infrastructure. Integration coverage
includes transaction rollback, ten concurrent duplicates, changed-payload
conflicts, web/MCP process restart, stored evidence, and input/access validation.
Actual counts and red/green history are in [the verification ledger](docs/verification.md).
This is a local single-operator prototype, not an authenticated hosted service.
