# HomeRelay submission copy

## Name and tagline
HomeRelay
A light on. A door still locked. Household assistance with rules and receipts.

## Inspiration
A household assistant should be able to explain both an action and a refusal.
Natural-language convenience is not sufficient authority to unlock a door, and a
retry should not create another action. HomeRelay makes those boundaries visible.

## What it does
HomeRelay provides a seeded arrival routine for explicit review and approval.
Run a simulated weekday evening arrival: deterministic policy permits the porch
light and keeps the door locked. Approve a separate unlock request and the same
policy still refuses it. Replay the exact arrival event to retrieve its original
receipt, then refresh and inspect the stored evidence explaining the result.

## How it works
A browser calls a Node web backend, which creates an official MCP SDK client and
calls a separate self-hosted MCP server using Streamable HTTP. The tested protocol
is 2025-11-25. The MCP service alone accesses PostgreSQL and deterministic policy.
An immutable routine revision and hash bind explicit approval to reviewed content.
One transaction stores the event, decision snapshots, simulated device update and
allowed action receipt. Database uniqueness prevents duplicate committed actions.
Denied actions have no receipt. Evidence explains the original decision rather
than recomputing history with current rules.

## Challenges and accomplishments
The difficult part was making retries, failures and approval boundaries observable
and correct together. Real PostgreSQL tests cover ten concurrent duplicate events,
transaction rollback and process restart; real browser tests cover approval,
denial, refresh, keyboard focus and MCP outage/recovery. A responsive editorial
interface separates current device state, this visit's result and saved decisions.

## What is next
Production identity and household isolation, a trusted sunset source, revision
editing and a constrained proposal parser would be next. External devices require
a separate delivery/reconciliation design. They are not implemented here.

## Track and scope
Alexa+ primary track, simulated web-experience path, with a real self-hosted MCP
server. No native Alexa+ account connection, Ring hardware, Bedrock or AWS runtime.
No AWS Builder or additional Open Source mini-challenge claim.

## Links
- Live application: https://homerelay-web.onrender.com
- Source: https://github.com/aayushkumbharkar/HomeRelay
- MCP endpoint: https://homerelay-mcp.onrender.com/mcp (bearer protected)
- Public English demo video: pending final upload and anonymous playback check

## Tool feedback
Official MCP TypeScript SDK v2: used for both client and server, Streamable HTTP,
tool schemas and structured results. Initialization, discovery and input rejection
worked in separate-process tests. Package split and compatible imports required
careful reading; an end-to-end minimal Node example with locked package versions
and explicit protocol-negotiation assertions would improve onboarding. Would use
again because protocol behavior remains in the SDK, not application code.

PostgreSQL/pg: used for durable evidence, transaction rollback and unique event keys.
Concurrent replay tests and restart retrieval worked. Requires deliberate disposable
test DB provisioning. A small reference transaction/idempotency example would help.
Would use again for these consistency requirements.

Render: used for two Node services and managed PostgreSQL. Blueprint references
kept secrets server-side and used internal DB networking. Free MCP cold-start
latency initially caused a 503; waking the service and retrying recovered. A more
prominent free-service networking/cold-start checklist would improve onboarding.
Would use again for a prototype, with availability/retention planning for production.

Amazon tools/APIs/SDKs: no Amazon runtime API or SDK was invoked. This entry follows
the permitted Alexa+ simulation/MCP path. No invented Amazon onboarding feedback.
Development used Codex, installed Superpowers and UI design guidance; code and tests
were reviewed and executed. AI assistance is disclosed rather than represented as
manual-only development.

## Limitations for judges
One shared simulated household; approval may already exist and light may already
be on. A new scenario still produces a real policy-checked action receipt. Replays
reuse the original receipt. Free services may need a minute to wake; refresh
connection evidence. PostgreSQL free plan expires after 30 days, so longer-term
retention requires export or upgrade. No real device or user-private data is stored.
