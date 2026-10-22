# HomeRelay demo script (target 2 minutes 20 seconds)

Use the actual running site. Show simulated labels; do not imply native Alexa or
hardware integration. For a new draft recording use a fresh dedicated test schema,
never erase the live household. A previously approved live demo must be described
as previously approved, not presented as a fresh approval.

0:00–0:20 — HomeRelay makes household automation inspectable. This prototype uses
simulated devices, a real self-hosted MCP server, and PostgreSQL. Review the seeded
weekday after-sunset arrival draft and the hard rule against door unlocking.

0:20–0:40 — Click Approve routine. Approval is bound to this immutable revision;
approval alone changes no device. Simulate Wednesday 21 October at seven pm,
after the dated six pm sunset fixture.

0:40–1:05 — Porch state becomes On only after the backend confirms the result.
The door stays Locked. Open the executed decision: show policy version, stored
approval, event time, sunset fixture and action receipt. The web backend calls
MCP through the official SDK over Streamable HTTP; no browser policy fallback.

1:05–1:30 — Request unlock. Explicitly approve the separate test request. The
policy still denies it. Show DOOR_UNLOCK_FORBIDDEN, locked state, and no receipt.

1:30–1:50 — Replay arrival. Show the replay notice and identical original decision
and receipt. Database uniqueness and a transaction prevent duplicate effects.

1:50–2:15 — Refresh. Retrieve the same decision from history and inspect its
persisted evidence. State that application restart recovery is automated-tested;
show actual deployed restart proof only after it is executed.

2:15–2:20 — End: simulated household, real MCP, explicit approval, deterministic
policy, durable evidence. No Bedrock, native Alexa+ or physical device claim.

Publishing gate: final English recording must be under three minutes, publicly
accessible on the platform required by the official rules. A local video file
is not a public submission. No video has been published yet.
