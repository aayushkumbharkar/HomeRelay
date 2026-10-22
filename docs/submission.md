# HomeRelay submission copy

## Name and tagline
HomeRelay Time Machine
Replay the incident. Test the fix. Block regressions.

## Inspiration
When a household automation does the wrong thing, the usual fix is to change the
rule and hope. HomeRelay treats routine changes like code changes: reproduce the
incident from stored evidence, test the fix against a regression suite, and refuse
anything that weakens a safety boundary before it is approved.

## What it does
HomeRelay Time Machine is a counterfactual debugging and regression-testing workbench
for MCP-powered household automations. It reconstructs a saved decision, such as a
Saturday arrival that a weekday-only routine refused, from its stored snapshots. The
recorded reason code identifies the failed policy check, and each check cites stored
evidence. If no such record exists, it shows a labelled scenario fixture rather than
inventing one.

You then propose a fix (add Saturday) and run a preflight suite. Through a real MCP
tool, the server evaluates six cases with the production policy engine for the
current routine and the candidate: weekday, Saturday, before sunset, missing sunset,
unapproved and door unlock. The table shows that only the Saturday decision changes
and that every safety invariant still holds. If someone tries to slip a door unlock
into the candidate, the suite fails and every unlock stays denied. Preflight uses a
clearly labelled simulated approval, saves only the test run, and never activates
the candidate or touches devices, events or receipts.

The original household flow remains: explicit approval, a simulated arrival that
lights the porch, an approved unlock that is still denied, and idempotent replay.

## How it works
A browser calls a Node web backend, which creates an official MCP SDK client and
calls a separate self-hosted MCP server using Streamable HTTP. The tested protocol
is 2025-11-25. The MCP service alone accesses PostgreSQL and deterministic policy.
An immutable routine revision and hash bind explicit approval to reviewed content.
One transaction stores the event, decision snapshots, simulated device update and
allowed action receipt. Database uniqueness prevents duplicate committed actions.
Denied actions have no receipt. Evidence explains the original decision rather
than recomputing history with current rules. Three more MCP tools with typed
schemas (`reconstruct_incident`, `run_preflight` and `get_preflight_run`) power the
Time Machine. Preflight reuses the production `evaluate()` function without the
event-processing path. An additive, checksummed migration stores runs. There is no
runtime LLM. Every result comes from stored evidence or deterministic rules.

## Challenges and accomplishments
The difficult part was making retries, failures and approval boundaries observable
and correct together. Real PostgreSQL tests cover ten concurrent duplicate events,
transaction rollback and process restart; real browser tests cover approval,
denial, refresh, keyboard focus and MCP outage/recovery. Time Machine tests show
that preflight leaves seven domain tables byte-identical, that only the expected
decision changes, that unlock bypass attempts fail, and that a populated database
upgrades safely while the server refuses to start on an unmigrated schema.

## What is next
Turning a passing candidate into a new unapproved revision for explicit approval,
user-defined preflight cases, production identity and household isolation, a trusted
sunset source and a constrained proposal parser would be next. External devices require
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
