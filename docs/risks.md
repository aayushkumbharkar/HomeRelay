> Continuation 2026-10-22: seeded-draft UI implemented; local browser flow passed.
> Render deployment in progress. See docs/render-deployment.md and verification.md.
> Older deferred-scope/status notes below are historical.

# Risks and blockers

Updated 2026-10-22 (Asia/Calcutta): backend slice implemented. The table below
preserves the planning baseline; current resolutions are listed first.

## Current resolutions and remaining gates

- Docker 29.2.0 and host PostgreSQL 18 were available outside the sandbox.
  Sandbox access restrictions caused the current false-unavailability probes;
  the original prior-turn service state cannot be reconstructed.
- Host PostgreSQL 18 is running on 5432; version 17 is installed but stopped.
  No host database settings or credentials were changed. HomeRelay instead uses
  its own healthy Docker PostgreSQL 18.6 on loopback 15432 with a named volume.
- Windows reserves 55425–55524, including the first attempted port 55432. The
  specific HomeRelay port change to 15432 resolved container startup.
- SDK packages and Node 24.22.0 are installed locally and locked; a separate-process
  SDK test negotiated 2025-11-25 successfully. Existing system Node is untouched.
- Transaction, race, denial and process-restart tests have run; actual counts are
  in verification.md. Backend is local single-operator only. Full frontend,
  natural-language revisions and native Alexa onboarding remain unimplemented.
- No browser end-to-end test, live-device operation, Bedrock invocation or hosted
  authentication has been attempted. Restart proof covers application processes;
  PostgreSQL-container restart durability is a separate future verification.
- No remaining environment blocker was found for this backend slice. In Codex,
  Docker/network/process tests need execution outside the restricted sandbox.
- Repository has no commits or remote; changes remain local/uncommitted on
  codex/m1-vertical-slice. Publishing and submission were not performed.

## Planning baseline (historical)

| Risk | Evidence / impact | Resolution and milestone gate |
| --- | --- | --- |
| PostgreSQL service unavailable | pg_isready reported no response on default port; DATABASE_URL absent. psql 18.4 is only a client-version check | Before M1 integration tests, provision isolated PostgreSQL 18 via working Docker or provide a verified DB URL; run SELECT version(), migrations and rollback check |
| Docker unavailable | CLI 29.2.0 installed, Linux-engine named pipe absent | Start/repair Docker Desktop or use explicitly configured local PostgreSQL; don't change unrelated services blindly |
| Service inventory restricted | Get-Service could not open Service Control Manager | Cannot conclude PostgreSQL is uninstalled or that no other port works; verified endpoint is still required |
| SDK install/compatibility unproven | Registry metadata confirms package versions, but none are installed | Verify peer dependencies, lock versions, compile and run real handshake before marking M1 complete |
| Runtime support | Installed Node 20.20.2 satisfies SDK engine metadata but is EOL in upstream schedule | Use project Node 24 LTS runtime/container; record exact runtime and recheck dependency engines |
| Approval race or stale edit | An approved boolean could authorize different content | Immutable revisions/hashes; lock routine head for edit/approve/evaluate; test stale approvals and concurrent operations in M2 |
| Duplicate actions / lost replies | Retries and concurrent arrivals can double-run naive handlers | DB unique key and single transaction; concurrent replay, conflict and restart tests in M1 |
| Unverifiable history | Recomputed explanations could disagree with original decision | Store all policy inputs/version/approval/action evidence; read-only retrieval tests in M1 |
| Ambiguous natural language | General model parsing may invent defaults or actions | Limited labelled parser and clarification; explicit review/approval; optional model stays outside execution authority |
| Sunset/time semantics | Host timezone or current-clock logic changes decisions | Dated server simulation fixtures, IANA timezone, strict boundary tests; no live-sunset claim |
| Public exposure | Local demo operator is not production authentication | Loopback, MCP secret, Origin/Host checks, CSRF; hosted identity/TLS/access review before external deployment |
| Alexa+ overclaim | Local MCP is not proof of native Alexa account onboarding | Describe as simulated web experience backed by real MCP; separate native onboarding proof if pursued |
| Bedrock unknown | AWS CLI exists; credentials, identity, region and model access were not checked | Not an M1 blocker. Before adding, verify identity and one actual model invocation; never claim AWS runtime integration from CLI presence |
| Deadline and submission evidence | Official deadline Oct 23, 2026 12:00 PDT = Oct 24, 2026 00:30 IST | Prioritize M1-M3 only. Prepare repository access, reproducible instructions, English public video under 3 minutes and factual product feedback; do not submit automatically |
| Existing untracked material | `.agents/` predates this task; no commits/remotes | Preserve it; stage only requested files if committing later; repository publishing/access choice remains outstanding |

Sources for external requirements and runtime support: [official sources](sources.md).
These are planning risks, not assertions that safeguards already exist.
