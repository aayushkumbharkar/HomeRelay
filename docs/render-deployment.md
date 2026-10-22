# Interface milestone and deployment

The 2026-10-22 continuation authorizes a seeded-draft browser demonstration,
then Render release. Natural-language parsing and editing remain deferred.

Design contract: a calm household workspace with a clear approve-then-simulate
sequence, visible safety boundary, server-confirmed device states and inspectable
persisted evidence. No decorative charts. Desktop 1440x1000; mobile 390x844.
Use semantic controls, visible keyboard focus, reduced-motion support, readable
wrapping, and no optimistic device state. System fonts and CSS illustration; no
frontend framework or external asset dependencies.

Implemented files: public/index.html, public/style.css, public/app.js;
src/contracts.ts, src/fixtures.ts, src/mcp-server.ts, src/web.ts;
tests/integration/workspace.test.ts, tests/e2e/demo.test.ts, package files.
Two read-only MCP tools expose device state and the latest 50 saved decisions.
A separate seeded door-denial-r1 revision allows explicit approval and a policy
challenge without modifying the arrival routine. The schema needs no migration.

Render adaptations: src/mcp-http.ts, src/mcp-client.ts, src/mcp-server.ts,
src/web.ts, render.yaml, package.json, tests/integration/hosting.test.ts.
Both processes bind BIND_HOST/PORT; production uses 0.0.0.0 and Render's PORT.
RENDER_EXTERNAL_URL provides an exact Host/Origin allowlist. MCP is protected by
a generated bearer token copied server-side through a Blueprint reference.
MCP_BASE_URL references its public HTTPS URL; free web services cannot receive
private-network traffic. DATABASE_URL uses the internal connectionString in the
same Oregon region. PostgreSQL external access is disabled.

Production MCP startup verifies/applies the checksummed migration under a database
advisory lock, idempotently seeds, then listens. A failed migration/seed stops
startup. /healthz on MCP queries PostgreSQL; web health is process liveness only.
The UI separately verifies end-to-end MCP availability. A cold MCP returns a
visible unavailable response; retry after waking. No policy/database fallback.

This is a shared public simulated household, not authenticated household hosting.
All visitors see the same demo approvals and evidence; enter no personal data.
MCP secret never enters browser code. Free PostgreSQL expires after 30 days and
has no backups; free services sleep and share a workspace monthly-hour limit.
Upgrade/export before expiry for longer retention. No paid resource is authorized.

Deployment is not proven until actual URLs, runtime logs and hosted workflow
checks are recorded in verification.md. Railway is abandoned.

Official references checked 2026-10-22:
- https://render.com/docs/blueprint-spec
- https://render.com/docs/private-network
- https://render.com/docs/free
- https://render.com/docs/web-services


Live resources were provisioned and verified before redesign. Web:
https://homerelay-web.onrender.com; MCP: https://homerelay-mcp.onrender.com/mcp.
Both are free Node services, managed PostgreSQL 18 is free in Oregon. The full
browser scenario and independent API smoke passed; see verification.md for the
cold-start failure and successful retry. Redesign deploy is recorded separately.
