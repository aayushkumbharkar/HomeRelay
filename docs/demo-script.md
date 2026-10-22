# HomeRelay Time Machine demo script (target 2 minutes 30 seconds)

Use the actual running site. Show simulated labels; do not imply native Alexa,
hardware integration or a runtime LLM. For a fresh recording use a dedicated test
schema; never erase the live household. Describe the live state as you find it: a
previously approved routine or previously recorded incident must be described as
such, not presented as new.

0:00–0:20 — HomeRelay Time Machine: replay the incident, test the fix, block
regressions. It is a debugging workbench for MCP household automations, with
simulated devices, a real self-hosted MCP server and PostgreSQL. No model inference;
every result comes from stored evidence or deterministic rules.

0:20–0:50 — Incident (01). If it shows "Recorded · PostgreSQL", read the verified root
cause: the stored decision's reason code OUTSIDE_WEEKDAYS. "Local weekday is in the
schedule" failed for a Saturday arrival on a Mon–Fri routine. Point out the passed
checks citing the stored approval, the not-reached sunset checks, and "no receipt".
If it shows "Scenario fixture · not recorded", say so, then click Record simulated
Saturday arrival (routine must be approved) to store a real simulated-event decision.

0:50–1:05 — Candidate fix (02): the diff shows Mon–Fri plus Saturday, in memory only.
Point to the safety invariants (03) that every candidate must keep.

1:05–1:35 — Run preflight suite. The web backend calls the run_preflight MCP tool. Six
cases are evaluated by the production policy engine for baseline and candidate. Only
the Saturday row changes, from OUTSIDE_WEEKDAYS to ARRIVAL_RULE_MATCHED. Daytime,
missing sunset, unapproved and unlock remain denied. PASS, 0 safety violations,
invariants ticked, and the notice confirms device state unchanged. Note "Simulated
approval · test only": nothing was approved or activated.

1:35–1:55 — Tick "Also request front-door unlock" and rerun. FAIL with
PROHIBITED_ACTION_REQUESTED; every unlock verdict is DOOR_UNLOCK_FORBIDDEN. Click
Retrieve saved run to show the run comes back from PostgreSQL via get_preflight_run.

1:55–2:20 — Live household (05–07): the original flow still works. Explicit approval,
a porch light arrival, an approved unlock that is still denied, and replay returning
the original receipt. Select a saved decision to reconstruct it as an incident.

2:20–2:30 — End: recorded evidence, a counterfactual test through real MCP, and
safety invariants enforced server-side. No Bedrock, native Alexa+ or physical
device claim.

Publishing gate: final English recording must be under three minutes, publicly
accessible on the platform required by the official rules. A local video file
is not a public submission. No video has been published yet.
