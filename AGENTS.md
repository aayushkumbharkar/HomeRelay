# HomeRelay working agreement

## Product and scope

Build HomeRelay for the Amazon Developer Hackathon, Alexa+ primary track. Read
`docs/superpowers/specs/2026-10-22-homerelay-design.md`, `docs/architecture.md`,
`docs/acceptance-tests.md`, and `docs/risks.md` before changing behavior.
The user has authorized the first backend vertical slice (M1). Scope is the real
MCP connection, explicit seeded-routine approval, deterministic simulated actions,
PostgreSQL transactions, replay and restart verification. The frontend, natural
language proposals, Bedrock and secondary features remain outside current scope.
See `docs/superpowers/plans/2026-10-22-homerelay-vertical-slice.md` and the latest
user instruction for milestone boundaries.

## Workflow

- Use installed Superpowers selectively: brainstorming for design, writing-plans
  for plans, executing-plans for implementation, test-driven-development for
  behavior, systematic-debugging for failures, verification-before-completion
  before claiming completion. Locate their SKILL.md files; do not silently claim
  to use an unavailable skill. This machine has them in
  `C:/Users/Aayush/.agents/skills/`.
- Follow the Karpathy guidelines: state assumptions, define an observable goal,
  make the smallest change that satisfies it, verify, and stop. No speculative
  abstractions, unrelated refactors, or dependencies without a concrete need.
- Load frontend design skills only for interface work. Do not load every skill.
- Follow red/green/refactor: write a behavior test, observe its intended failure,
  implement minimally, rerun. A missing database or broken import is an
  infrastructure error, not evidence of an intended red assertion.
- Test real MCP over a network socket and real PostgreSQL for integration claims.
  Mocks, in-memory databases, and direct handler calls cannot prove this slice.
- Preserve existing user files, especially the currently untracked `.agents/`.
  Avoid bulk staging. Do not publish or submit hackathon material implicitly.

## Invariants

- Natural-language output is an editable proposal, never execution authority.
- Approval is explicit and bound to the exact immutable routine revision.
  Editing creates an unapproved revision. Never trust an input `approved` flag.
- Server-side deterministic rules have final authority. Door unlock is denied
  even when a user approves a proposal containing it.
- The web backend calls the self-hosted MCP server through the official SDK.
  No direct database/policy fallback when MCP fails; no hand-written MCP protocol.
- PostgreSQL is authoritative for approvals, events, decisions, action records,
  and simulated device state. Commit these atomically where required.
- Replay returns the original decision and causes no duplicate action. Enforce
  uniqueness in PostgreSQL, including concurrent requests and restarts.
- Explanations cite stored inputs, policy version, reason codes, approval and
  action evidence. Do not fabricate history or recompute old decisions as truth.
- All devices/events are explicitly simulated. Never imply Alexa+, Ring, or real
  home-device connectivity without executed integration evidence.
- Bedrock is optional; do not make it a prerequisite until account, region,
  credentials and an actual model invocation have been verified.
- Keep credentials out of source, browser bundles, logs, and test reports.

## Milestone reporting

For each milestone report exact changed files, acceptance criteria, commands
actually executed and their results, and remaining risks/blockers. Use
`docs/verification.md` as the evidence ledger. Record unexecuted tests as NOT RUN,
never as passing. Capture red and green results during implementation. Commands
in the plan are future commands until the corresponding scripts exist.
