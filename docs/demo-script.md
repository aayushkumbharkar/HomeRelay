# HomeRelay Time Machine demo (as recorded, 2:34)

> **Historical.** This documents the earlier video recorded on the Render deployment. It is
> superseded by the Vercel recording script, [demo-script-vercel.md](demo-script-vercel.md).

Recorded 2026-10-23 from the live deployment https://homerelay-web.onrender.com with a
Playwright-driven Edge browser (1440x810, upscaled to 1920x1080) and a synthesized
English narration (Windows speech, voice Zira). The only writes during recording were
saved preflight runs. The recorded Saturday incident is a simulated event stored earlier
by the hosted smoke test; it is reconstructed, not staged in the video. A presentation-only
outline (set via CSSOM; the site CSP was not bypassed) marks the element being discussed.

## 0:01 — Intro

This is HomeRelay Time Machine, running live on Render. It is a debugging and regression testing workbench for household automations, built on a real, self-hosted MCP server and PostgreSQL. The devices and events are simulated, and there is no language model. Every result comes from stored evidence or deterministic rules.

## 0:22 — Incident

First, replay the incident. A simulated Saturday arrival at seven in the evening did not turn on the porch light. This panel is rebuilt through an MCP tool from the decision stored in PostgreSQL. The recorded reason code is outside weekdays: Saturday is not in the Monday to Friday schedule. Earlier checks passed, including the explicit approval. The sunset checks were never reached, and there is no action receipt.

## 0:48 — Candidate

The proposed fix adds Saturday to the schedule, and the diff shows exactly what changes. The candidate exists only in memory. It is not saved, approved or activated. On the right are the safety invariants that every candidate must keep.

## 1:04 — Preflight

Now, run the preflight suite. The web backend calls the run preflight tool on the MCP server. It evaluates six fixed cases with the production policy engine, once for the current routine and once for the candidate. Only one row changes. The Saturday arrival moves from outside weekdays to arrival rule matched. The weekday case is still allowed. Before sunset, missing sunset, the unapproved routine and the door unlock all remain denied. The suite passes, with zero safety violations, and every invariant holds. The approval used here is simulated for testing only, and device state did not change.

## 1:42 — Bypass

Next, an unsafe candidate. I also request a front door unlock, as if someone tried to slip it into the fix. The suite now fails, with prohibited action requested. In every case, the unlock is still denied, with door unlock forbidden. The server side rule wins, whatever else the candidate says.

## 2:04 — Saved run

Every run is saved in PostgreSQL. Retrieve saved run fetches it back through a second MCP tool, so the evidence can be reviewed later.

## 2:13 — Result

So what does this tell you? Adding Saturday fixes this incident and changes nothing else, and the door stays locked. The candidate is ready for explicit approval, but preflight itself never approves or activates anything. Replay the incident. Test the fix. Block regressions.

Publishing: the public URL and verified duration are recorded in verification.md once
uploaded. No URL is claimed until anonymous playback has been checked.
