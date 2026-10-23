# Vercel + Neon deployment

Status (2026-10-23): deployed and verified at **https://homerelay-opal.vercel.app**.
Render (homerelay-web / homerelay-mcp) remains provisioned as a rollback until this
deployment has run for a while; it is no longer the recommended URL.

## Why Render was replaced

Evidence recorded in [verification](verification.md): on Render's free tier the MCP
service sleeps, and server-to-server calls from the web service to the sleeping MCP
service fail in under ~1 s **without waking it**. With MCP untouched by anything else,
29 consecutive `/api/ready` calls over ~16 minutes all returned 503 and MCP never became
ready. Browser retries therefore could not succeed unless something external hit the
MCP URL. One deployment containing both functions removes that cross-service wake-up
dependency. It does not remove cold starts (measured below).

## Architecture

```text
Vercel deployment (one project, Hobby)
  static/      public/ (CDN, CSP + nosniff + no-store headers)
  api/web      Node.js 24 function: web API (src/vercel-web.ts -> createWebHandler)
                 └─ official MCP client ── HTTPS Streamable HTTP + bearer ──┐
  api/mcp      Node.js 24 function: stateless MCP endpoint at /mcp  ◄──────┘
                 (src/vercel-mcp.ts -> mcpNodeHandler -> official SDK createMcpHandler,
                  fresh McpServer per request)
                 └─ pg pool (max 2) ── TLS verify-full ──► Neon Free PostgreSQL 18
                                                           (aws-us-east-1, direct endpoint)
```

- The web function never touches the database or policy; it calls the MCP endpoint of
  its own deployment over HTTPS (production: the production domain; previews: their own
  URL, through Vercel's server-side automation bypass header).
- The MCP function and the standalone listener use the same guarded handler
  (`mcpNodeHandler`): Host/Origin allow-list, path, bearer token, 16 KiB body cap.
- CSRF tokens are an HMAC of `CSRF_SECRET`, so any instance validates them.
- Each MCP instance checks the schema version once and fails closed; migrations never
  run at request time.
- Packaging: `npm run build:vercel` compiles TypeScript and writes Vercel Build Output
  API v3 (`.vercel/output`) with the production dependency closure. No framework.

### Why the direct (unpooled) Neon endpoint

Neon's pooled endpoint (PgBouncer) accepted connections but reported
`statement_timeout=0` and `lock_timeout=0`, even after
`ALTER DATABASE neondb SET statement_timeout='5s', lock_timeout='5s'`: the 5-second
query and lock guards would be silently disabled. The direct endpoint verifiably applies
both (5 s). With at most 2 connections per function instance and low demo traffic, the
direct endpoint is the safer choice. Revisit pooling only with a timeout strategy that
is proven to apply through the pooler.

## Environment variables (Production and Preview)

| Name | Type | Value |
| --- | --- | --- |
| `DATABASE_URL` | Secret | Neon direct connection string, `sslmode=verify-full` |
| `MCP_TOKEN` | Secret | Random 64 hex characters, distinct from Render's |
| `CSRF_SECRET` | Secret | Random 64 hex characters |
| `PG_POOL_MAX` | Config | `2` |
| `PG_CONNECT_TIMEOUT_MS` | Config | `15000` (Neon resumes from suspend) |
| `MCP_TIMEOUT_MS` | Config | `20000` |

Set with `vercel env add NAME -e production,preview --sensitive` reading the value from
stdin (never `--value`, which exposes it in the process list). Vercel provides
`VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and, with Protection Bypass for Automation
enabled, `VERCEL_AUTOMATION_BYPASS_SECRET`.

## Database procedure (explicit, never at request time)

1. Create a Neon Free project (PostgreSQL 18).
2. With the **direct** connection string in a git-ignored env file:
   `node --env-file=<file> dist/scripts/migrate.js` (repeat to verify checksums), then
   `node --env-file=<file> dist/scripts/seed.js`.
3. One-time server defaults: `ALTER DATABASE neondb SET statement_timeout = '5s'` and
   `ALTER DATABASE neondb SET lock_timeout = '5s'`.

The Render database was not exported (external access stays disabled). Demo history on
Neon was created through the normal UI workflow and is labelled simulated.

## Deploy

```powershell
vercel deploy            # preview (protected by Vercel Authentication)
vercel deploy --prod     # production domain
```

`.vercelignore` excludes `.env*`, `.local/`, `.agents/`, `test-results/`, `dist/`,
`.vercel/` and `node_modules/` from uploads. Git integration is not connected; deploys
are explicit CLI actions.

## Eligibility and cost

Everything uses free plans: Vercel Hobby, Neon Free (no payment method on the Neon
account). Vercel's Hobby plan is limited to personal, non-commercial use, and its
fair-use guidelines define commercial use as a deployment "used for the purpose of
financial gain of anyone involved". Whether a cash-prize hackathon entry qualifies is
**ambiguous** and was not confirmed with Vercel; the project owner chose to proceed and
accepted that risk. Sources: https://vercel.com/terms,
https://vercel.com/docs/limits/fair-use-guidelines,
https://vercel.com/docs/accounts/plans/hobby.

## Rollback

Render services and their database are untouched. To roll back, point users to
https://homerelay-web.onrender.com (see [Render deployment](render-deployment.md)).
