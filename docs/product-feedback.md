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
   the verified code was pushed to the HomeRelay repository under that owner (since
   made public; visibility confirmed via the GitHub API on 2026-10-23).
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
| Render rollout of a new MCP tool (Time Machine) | Push commit; web and MCP auto-deploy separately | Both services switch together | Web served new UI first; preflight calls returned 503 until MCP rolled over | Moderate, transient | No fallback by design; poll an absent-ID endpoint (503 old vs 404 new) before verifying | Show per-service rollout state or allow grouped Blueprint deploys |
| Free-tier cold load of the web UI | Open page while MCP sleeps | Visible error state everywhere | Notice showed unavailable but incident badge stayed "Loading" | Moderate UX bug in our app | Fixed: incident panel shows "Unavailable" and no guessed incident | n/a (our defect, caught live, test added) |
| Browser layout test after reload | Measure table position after page.reload() | Page starts at top | Browser restored earlier scroll; viewport-relative check passed falsely | Moderate test-validity risk | Reset scroll, assert scrollY 0, measure document coordinates | Note scroll restoration in Playwright layout-testing guidance |
| GitHub push from a multi-account machine | git push with default credential | Push as repository owner | 403: active gh account lacked push permission | Low | Verify identity/permission via gh api, switch only for the push, restore | Clearer credential-manager account selection per remote |

These are environment/developer-experience observations, not claims of defects in
Amazon APIs. No Amazon runtime was exercised, so no Amazon-specific failure is invented.
