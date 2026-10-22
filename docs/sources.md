# Official documentation inspected

Checked 2026-10-22. Source facts below inform proposed design; they are not executed
integration evidence. Recheck versions and rules before implementation/submission.

- [Amazon Developer hackathon overview](https://amazonappdev2026.devpost.com/):
  Alexa+ permits a self-hosted MCP server using specification 2025-11-25 or later
  over Streamable HTTP. It describes a simulated web experience path. Submission
  needs runnable repository content, a public English demo video under three
  minutes, and product feedback. Record actual integration evidence in the demo.
- [Official hackathon rules](https://amazonappdev2026.devpost.com/rules): minimum
  MCP version and working-app requirements; deadline October 23, 2026, noon PDT,
  equivalent to October 24, 2026, 00:30 Asia/Calcutta. This is planning information,
  not a determination of entrant eligibility or a submission confirmation.
- [Official TypeScript SDK repository](https://github.com/modelcontextprotocol/typescript-sdk)
  and [v2 package documentation](https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages.html):
  server/client are separate packages; the official Node adapter serves built-in
  HTTP without requiring a framework. Avoid mixing these with v1 examples.
- [SDK HTTP server](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html):
  createMcpHandler constructs a server per request; durable domain state belongs
  outside transport instances.
- [SDK HTTP client](https://ts.sdk.modelcontextprotocol.io/v2/clients/connect):
  Client with StreamableHTTPClientTransport performs the initialize handshake.
- [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  Streamable HTTP contract and Origin validation/security considerations. Use
  the SDK implementation; do not manually reproduce JSON-RPC/HTTP negotiation.
- [Alexa+ MCP QuickStart](https://www.developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart):
  native Alexa+ onboarding has requirements beyond running a local MCP server;
  this project initially claims only a simulated web experience.
- [Alexa+ client lifecycle](https://www.developer.amazon.com/docs/alexaplus/add-ons/category-sdk-mcp-client-lifecycle):
  category-specific lifecycle examples are background, not a substitute for the
  hackathon's minimum protocol requirement.
- [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html) and
  [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html):
  unique constraints, ON CONFLICT and row locks support the proposed transaction.
  Concurrency behavior still requires our own real-database tests.
- [Node release schedule](https://nodejs.org/en/about/previous-releases): use a
  supported LTS runtime; select Node 24 for implementation rather than relying
  on the installed Node 20 beyond its support window.

Registry metadata was also queried with `npm view` for server/client/node SDK
versions and engines. See [actual command results](verification.md). No package
install, handshake, AWS invocation, or device integration was performed.
