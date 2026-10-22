import { McpServer } from '@modelcontextprotocol/server';
import { openDb, household, schemaVersion } from './db.js';
import { listenMcp } from './mcp-http.js';
import { z } from 'zod';
import { tools, envelope, DomainError, type ToolName } from './contracts.js';
import { getRoutine, approveRoutine } from './routines.js';
import { processEvent, getDecision } from './decisions.js';
import { reconstructIncident } from './incident.js';
import { runPreflight, getPreflightRun } from './preflight.js';

const pool = openDb(process.env.DATABASE_URL!);
try {
  const migration = await pool.query('SELECT version FROM schema_migrations WHERE version=$1', [schemaVersion]);
  if (!migration.rowCount) throw new Error('Migration required');
  const listener = await listenMcp(() => {
    const server = new McpServer({ name: 'homerelay', version: '0.1.0' });
    const register = (name: ToolName, run: (input: unknown) => Promise<unknown>) => {
      const definition = tools[name];
      server.registerTool(name, {
        description: `${name}: simulated household only; approval never overrides policy.`,
        inputSchema: definition.input as z.ZodType<Record<string, unknown>>,
        outputSchema: envelope(definition.output)
      }, async input => {
        try {
          const result = await run(input);
          if (result === null) throw new DomainError('NOT_FOUND');
          const value = definition.output.parse(result);
          return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: { value, error: null } };
        } catch (error) {
          const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? 'INVALID_INPUT' : 'UNAVAILABLE';
          return { isError: true, content: [{ type: 'text', text: code }], structuredContent: { value: null, error: code } };
        }
      });
    };
    register('get_home', async () => ({devices: (await pool.query('SELECT device_id AS "deviceId", state FROM devices WHERE household_id=$1 ORDER BY device_id', [household])).rows}));
    register('list_decisions', async () => (await pool.query("SELECT evidence FROM decisions WHERE household_id=$1 ORDER BY evidence->>'evaluatedAt' DESC, decision_id LIMIT 50", [household])).rows.map(row => row.evidence));
    register('get_routine', input => getRoutine(pool, tools.get_routine.input.parse(input).routineRevisionId));
    register('approve_routine', input => { const args = tools.approve_routine.input.parse(input); return approveRoutine(pool, args.routineRevisionId, args.contentHash); });
    register('simulate_event', input => processEvent(pool, tools.simulate_event.input.parse(input)));
    register('get_decision', input => getDecision(pool, tools.get_decision.input.parse(input).eventId));
    register('reconstruct_incident', input => reconstructIncident(pool, tools.reconstruct_incident.input.parse(input).eventId));
    register('run_preflight', input => { const args = tools.run_preflight.input.parse(input); return runPreflight(pool, args.routineRevisionId, args.candidate); });
    register('get_preflight_run', input => getPreflightRun(pool, tools.get_preflight_run.input.parse(input).runId));
    return server;
  },
    process.env.MCP_TOKEN!, Number(process.env.PORT ?? process.env.MCP_PORT ?? 3001), {host: process.env.BIND_HOST, publicOrigin: process.env.RENDER_EXTERNAL_URL, health: async () => { await pool.query('SELECT 1'); }});
  process.send?.({ port: listener.port });
  console.log(`HomeRelay simulated MCP listening on ${process.env.BIND_HOST ?? "127.0.0.1"}:${listener.port}`);
  const stop = async () => { await listener.close(); await pool.end(); };
  process.once('SIGTERM', () => void stop()); process.once('SIGINT', () => void stop());
} catch { await pool.end(); console.error('MCP startup failed; check database, migrations, token and port'); process.exitCode = 1; }
