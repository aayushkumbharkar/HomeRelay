# Product feedback and observed friction

These are developer observations from executed work, not user interviews.

- Explicit review makes the safety boundary visible before any action. The
  approved unlock test demonstrates that user approval is necessary but cannot
  authorize a forbidden action. This distinction is clearer than a generic toast.
- Receipt IDs and stored snapshots make replay verifiable. The browser can show
  the original action instead of describing a repeated request as a new success.
- A stopped MCP service is visible as an unavailable state. Last-known evidence
  stays readable but is labelled possibly stale, with actions disabled.
- The dated sunset fixture makes demos reproducible but is not general household
  scheduling. A production version needs a trusted sunset source and explicit
  uncertainty behavior; the current policy denies missing evidence.
- The local demo has one shared household and no user authentication. Hosted
  visitors must not enter private household information. Per-user identity and
  isolation would be prerequisites for real household use.

## Actual engineering friction log

1. Restricted execution initially made Docker/PostgreSQL probes appear unavailable.
   Outside the sandbox, Docker and host PostgreSQL were running. Isolated Docker
   PostgreSQL was chosen without modifying the existing host database.
2. Port 55432 was in a Windows reserved range. Moving only the project port to
   15432 resolved startup. This was verified, not guessed from a CLI version.
3. Official MCP v2 package split required compatible client/server/node imports.
   A separate-process transport test negotiated 2025-11-25 and rejected invalid
   tool arguments. Protocol code stayed inside the official SDK.
4. Fetch normalizes Host; the forged-Host boundary test uses node:http so it
   actually sends the intended header rather than testing a different request.
5. Railway CLI was unauthorized. The user selected Render; Railway was abandoned.
6. Render browser required user sign-in. Account menu then confirmed the specified
   email before any resource creation. Existing Git provider was aayushkumbharkar;
   the verified code was pushed to a private HomeRelay repository under that owner.
7. Render free web services cannot receive private network traffic. Blueprint
   uses public HTTPS MCP with a server-only bearer secret and private PostgreSQL.
8. Windows Python default text encoding failed while updating documentation.
   Explicit UTF-8 resolved the document read; this did not affect the application.

No feedback is attributed to Alexa+, Bedrock or real device users: those systems
were not exercised. Hosted build/runtime observations will be added only when seen.

## Structured observed friction (for submission)

| Task / tool | Steps | Expected | Actual | Severity | Workaround | Suggested improvement |
| --- | --- | --- | --- | --- | --- | --- |
| Start isolated PostgreSQL / Docker on Windows | Start container on 55432 and inspect bind failure | Available loopback port | Port was inside reserved 55425–55524 range | Blocker during setup | Use project-only 15432 | Preflight reserved-port diagnostics in setup guidance |
| Verify MCP SDK compatibility | Inspect official package peers, import v2 classes, run separate-process initialization/list/call | One matching official client/server transport pair | Split packages required aligned v2 imports; negotiated 2025-11-25 | Moderate onboarding | Pin compatible packages and executable transport test | Publish locked minimal Node client/server example with negotiated-version assertion |
| Deploy free Render MCP | Deploy separate web/MCP services and call after idle | Prompt end-to-end request | First call returned 503 during wake; health then passed and retry succeeded | Moderate demo friction | Explain wake delay; wait and refresh; no fabricated success | Surface free networking/wake constraints alongside Blueprint plan selection |
| Prepare Devpost draft | Sign in, choose Start project | Open project editor | CAPTCHA required human completion | Low; expected security interaction | User completed challenge | Preserve entered draft progress across challenge handoff |

These are environment/developer-experience observations, not claims of defects in
Amazon APIs. No Amazon runtime was exercised, so no Amazon-specific failure is invented.
