# HomeRelay

**A light on. A door still locked.**

An assistant that acts within your rules and keeps proof of every decision.
HomeRelay is a simulated household experience for the Alexa+ primary track of
the Amazon Developer Hackathon. It uses a real self-hosted MCP server, deterministic
policy, and PostgreSQL. No native Alexa+, Ring, physical lock or Bedrock integration
is claimed.

**Live:** https://homerelay-web.onrender.com  
**MCP:** https://homerelay-mcp.onrender.com/mcp (server-held bearer authentication)

## Try it

1. Review the seeded weekday, after-sunset arrival routine. Approve it explicitly
   if it is still a draft. Approval itself performs no action.
2. Choose **Run arrival scenario**. The backend confirms a simulated porch-light
   action; the door remains locked.
3. Choose **Try prohibited action**, then approve the separate test request.
   The policy denies door unlocking even with approval.
4. **Replay same event** returns the original decision and action receipt.
5. **Why did this happen?** retrieves stored evidence. Refresh and choose a saved
   decision; expand **Technical evidence** for complete IDs and snapshots.

This is one shared demonstration household. Other visitors may have already
approved the seed or turned the light on. A fresh page never claims to have run a
new scenario. Do not enter personal data. Free Render services can take about a
minute to wake; if unavailable, wait and select **Refresh evidence**.

## Architecture and guarantees

```text
Browser → Node web backend → official MCP client → HTTPS Streamable HTTP
        → separate official-SDK MCP server → deterministic rules → PostgreSQL
```

The browser contains no MCP credential, database connection or policy engine.
The web backend has no database or policy imports and cannot bypass an MCP outage.
SDK pins: client/server 2.3.1, Node adapter 2.1.1. The executed transport test
negotiates MCP **2025-11-25**. The SDK owns protocol serialization and negotiation.

Approval is bound to an immutable revision and content hash. Policy checks the
approval, current revision, event kind, local weekday and dated sunset fixture.
Door unlocking is always denied. Missing sunset evidence fails closed. The demo
simulates 21 October 2026 at 19:00 Asia/Kolkata with sunset at 18:00.

One PostgreSQL transaction stores the event, immutable decision snapshots, allowed
action receipt and simulated device update. Unique household/event and
decision/action constraints prevent duplicate commits, including ten simultaneous
replays. Reusing an ID with different input returns 409. Replays return the old
result, even if rules or approvals later change. A denied action has no receipt.
These guarantees cover the transactional simulator, not external hardware delivery.

## Local setup

Prerequisites: npm with bootstrap Node >=20, Docker Desktop, and Microsoft Edge
for the browser test. `npm ci` installs a pinned project Node 24.22.0 runtime.
Run from the repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Keep an existing `.env`. Replace placeholders with random secrets; use the same
PostgreSQL password in POSTGRES_PASSWORD and both connection URLs. Never commit it.

```powershell
docker compose up -d --wait
docker compose exec -T db psql -U homerelay -d homerelay -c 'CREATE DATABASE homerelay_test;'
npm run db:migrate
npm run db:seed
npm run build
```

Create the test database only once. PostgreSQL runs on loopback port 15432 with a
named volume; existing host PostgreSQL is untouched. Another PostgreSQL instance
may be used by configuring the URLs. The test database name must end in `_test`.
Migrations are transactional and checksummed under an advisory lock. Seeds preserve
existing approvals, decisions and device state. Never delete the volume to restart.

In separate terminals:

```powershell
npm run start:mcp
npm run start:web
```

Open http://127.0.0.1:3000. Local MCP listens on http://127.0.0.1:3001/mcp.

## Environment variables

| Name | Purpose |
| --- | --- |
| POSTGRES_PASSWORD | Local Docker database password; secret |
| DATABASE_URL | PostgreSQL connection; MCP/migration/seed only; secret |
| TEST_DATABASE_URL | Dedicated test DB ending `_test`; secret |
| MCP_TOKEN | At least 32 characters; shared only between web and MCP; secret |
| MCP_URL | Full local MCP endpoint, including `/mcp` |
| MCP_BASE_URL | Render public MCP service URL; client appends `/mcp` |
| MCP_PORT / WEB_PORT | Local ports; defaults 3001 / 3000 |
| PORT | Render-assigned listening port; overrides local port |
| BIND_HOST | Local default 127.0.0.1; Render 0.0.0.0 |
| RENDER_EXTERNAL_URL | Render-provided exact public origin for Host/Origin checks |
| NODE_VERSION | Render runtime pin 24.22.0 |
| SMOKE_URL | Explicit HTTPS target for hosted verification scripts |

## Tests

```powershell
npm run test:unit
npm run test:integration
npm run test:e2e
npm run typecheck
git diff --check
```

Unit tests cover deterministic policy and strict schemas. Integration tests use
real PostgreSQL and separate HTTP MCP/web processes, including rollback, races,
input/access boundaries, restart, outage, health and hosting configuration.
Browser tests use real services in a disposable schema, exercise keyboard focus,
approval, denial, replay, refresh, neutral page state, mobile layout, outage and
recovery. They never reset the demonstration DB. Configure the browser channel in
`tests/e2e/demo.test.ts` if Microsoft Edge is unavailable on your OS.

`npm run test:mcp` is a database-independent official-SDK transport proof.
No test silently skips missing services. See [actual results](docs/verification.md).

## Render

[render.yaml](render.yaml) provisions two free Node web services and PostgreSQL 18
in Oregon. The MCP process migrates/seeds before listening and stops on startup
failure. `/healthz` checks MCP database connectivity; the web health check is
process liveness, while the UI checks the full chain. Free services cannot receive
private traffic, so web calls public HTTPS MCP with a generated server-only token.
The database connection is internal; external PostgreSQL access is blocked.

See [deployment details](docs/render-deployment.md). PostgreSQL free-plan data
expires after 30 days; upgrade or export before expiry to retain evidence. Free
services sleep and have shared usage limits. This is not production availability.

## Limits and submission evidence

Seeded drafts only: no arbitrary natural-language parser, editing, model inference,
user identity, private household isolation, live sunset source or hardware adapter.
All events and devices are explicitly simulated. No AWS mini-challenge claim.

- [Verification](docs/verification.md) and [acceptance matrix](docs/acceptance-tests.md)
- [Architecture](docs/architecture.md) and [risks](docs/risks.md)
- [Demo script](docs/demo-script.md) and [product feedback](docs/product-feedback.md)
- [Submission draft](docs/submission.md)

MIT licensed. See [LICENSE](LICENSE).
