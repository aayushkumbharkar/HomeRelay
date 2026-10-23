# HomeRelay submission copy

## Name and tagline

**HomeRelay Time Machine**\
*Replay the incident. Test the fix. Block regressions.*

## Inspiration

When a household automation does the wrong thing, the usual fix is to change the rule and hope. HomeRelay treats routine changes like code changes: reproduce the incident from stored evidence, test the fix against a regression suite, and refuse anything that weakens a safety boundary before it is approved.

## What it does

HomeRelay Time Machine is a counterfactual debugging and regression-testing workbench for MCP-powered household automations. It reconstructs a saved decision, such as a Saturday arrival that a weekday-only routine refused, from stored snapshots. The recorded reason code identifies the failed policy check, and each check cites stored evidence. If no such record exists, it shows a labelled scenario fixture rather than inventing one.

You then propose a fix (add Saturday) and run a preflight suite. Through a real MCP tool, the server evaluates six cases with the production policy engine for the current routine and the candidate: weekday, Saturday, before sunset, missing sunset, unapproved and door unlock. The table shows that only the Saturday decision changes and that every safety invariant still holds. If someone tries to slip a door unlock into the candidate, the suite fails and every unlock stays denied. Preflight uses a clearly labelled simulated approval, saves only the test run, and never activates the candidate or touches devices, events or receipts.

The original household flow remains: explicit approval, a simulated arrival that lights the porch, an approved unlock that is still denied, and idempotent replay.

## How it works

The browser calls a Node.js 24 web function on Vercel. That web function uses the official MCP TypeScript SDK client to call HomeRelay's separate MCP endpoint over Streamable HTTP with a server-held bearer token. The MCP function alone accesses Neon PostgreSQL and the deterministic policy engine. The hosted database is PostgreSQL 18 using a direct TLS-verified connection. Migrations and seeding were run explicitly; no migration runs at request time.

An immutable routine revision and hash bind explicit approval to reviewed content. One transaction stores the event, decision snapshots, simulated device update and allowed action receipt. Database uniqueness prevents duplicate committed actions. Denied actions have no receipt. Evidence explains the original decision rather than recomputing history with current rules. Three MCP tools with typed schemas (`reconstruct_incident`, `run_preflight` and `get_preflight_run`) power the Time Machine. Preflight reuses the production `evaluate()` function without the event-processing path. An additive, checksummed migration stores runs. There is no runtime LLM: every result comes from stored evidence or deterministic rules.

## Challenges and accomplishments

The difficult part was making retries, failures and approval boundaries observable and correct together. Real PostgreSQL tests cover ten concurrent duplicate events, transaction rollback and process restart; real browser tests cover approval, denial, refresh, keyboard focus and MCP outage/recovery. Time Machine tests show that preflight leaves seven domain tables byte-identical, that only the expected decision changes, that unlock bypass attempts fail, and that a populated database upgrades safely while the server refuses to start on an unmigrated schema.

The first hosting setup put the web and MCP services on separate free Render instances. Repeated checks confirmed that web-to-MCP requests could fail fast while the sleeping MCP service did not wake, so browser retries could not recover the workflow. The app was moved to one Vercel deployment containing both functions, with Neon for persistence. Production checks then confirmed the MCP protocol version, tool discovery and schemas, the full browser workflow, saved-run retrieval, authentication rejection, origin checks, and the mobile layout.

## What is next

Turning a passing candidate into a new unapproved revision for explicit approval, user-defined preflight cases, production identity and household isolation, a trusted sunset source and a constrained proposal parser would be next. External devices require a separate delivery/reconciliation design. They are not implemented here.

## Track and scope

Alexa+ primary track, simulated web-experience path, with a real MCP server endpoint. No native Alexa+ account connection, Ring hardware, Bedrock or AWS runtime. No AWS Builder or additional Open Source mini-challenge claim.

## Links

- **Live application:** https://homerelay-opal.vercel.app
- **Source:** https://github.com/aayushkumbharkar/HomeRelay
- **MCP endpoint:** https://homerelay-opal.vercel.app/mcp (bearer protected)
- **Public English demo video:** add the YouTube URL only after upload and anonymous playback verification

## Tool feedback

**Official MCP TypeScript SDK v2:** used for both client and server, Streamable HTTP, tool schemas and structured results. Initialization, discovery and input rejection worked in separate-process tests and on the production endpoint. Package split and compatible imports required careful reading; an end-to-end minimal Node example with locked package versions and explicit protocol-negotiation assertions would improve onboarding. Would use again because protocol behavior remains in the SDK, not application code.

**PostgreSQL/pg:** used for durable evidence, transaction rollback and unique event keys. Concurrent replay tests and restart retrieval worked. Requires deliberate disposable test DB provisioning. A small reference transaction/idempotency example would help. Would use again for these consistency requirements.

**Vercel + Neon:** the single Vercel deployment makes the web and MCP functions available under the same project, removing the cross-service wake-up failure seen on Render. Neon Free PostgreSQL 18 retains state across function instances. The first readiness check after confirmed Neon idle returned 200 in 2.26 seconds; a warm check returned 200 in 0.98 seconds, and all page sections loaded within 4.7 seconds after Neon idle. These are single measurements, not guarantees, and Vercel function cold state was not directly observed. The Vercel Hobby plan's personal/non-commercial restriction creates an unresolved eligibility question for a cash-prize hackathon; this was not confirmed with Vercel.

**Render:** useful for the first prototype, but this two-service free-tier setup had a wake-up limitation: repeated web readiness calls failed quickly while the sleeping MCP service remained asleep. It taught us to test the full web-to-tool path while both services are idle, not just each service separately. Render remains only as a rollback.

**Amazon tools/APIs/SDKs:** no Amazon runtime API or SDK was invoked. This entry follows the permitted Alexa+ simulation/MCP path. No invented Amazon onboarding feedback. Development used AI coding assistants (Codex and Claude Code); code and tests were reviewed and executed. AI assistance is disclosed rather than represented as manual-only development.

## Limitations for judges

- Every device and event is simulated. There is no runtime LLM and no natural-language parsing; routines are seeded.
- No native Alexa+ device connection; this follows the hackathon's simulated web-experience path with a self-hosted MCP server endpoint.
- No physical Ring, smart-lock or other device control.
- No Amazon Bedrock integration and no AWS runtime API.
- The preflight suite is a fixed set of six cases on dated simulation fixtures (sunset fixtures exist for 21 and 24 October 2026 only), and candidates can change only weekdays and actions.
- A passing preflight does not activate the candidate; turning it into a new routine revision for explicit approval is not implemented.
- No production identity or multi-user household isolation; saved preflight runs are public and not rate-limited in the shared demo.
- Hosting uses Vercel Hobby and Neon Free. Neon suspends compute when idle; cold starts are reduced in this deployment but not eliminated. Vercel's Hobby plan is limited to personal, non-commercial use; whether a cash-prize hackathon entry qualifies is ambiguous and has not been confirmed with Vercel.
- Demo data on Neon was created through the normal UI and is simulated; no data was copied from Render.

No AWS mini-challenge eligibility and no Amazon API feedback are claimed.
