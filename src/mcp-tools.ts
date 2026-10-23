import type pg from 'pg';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { household } from './db.js';
import { tools, envelope, DomainError, type ToolName } from './contracts.js';
import { getRoutine, approveRoutine } from './routines.js';
import { processEvent, getDecision } from './decisions.js';
import { reconstructIncident } from './incident.js';
import { runPreflight, getPreflightRun } from './preflight.js';

// One fresh McpServer per request (stateless Streamable HTTP). `beforeCall` lets serverless
// hosts verify the schema version once per instance; failures surface as UNAVAILABLE.
export function createHomeRelayServer(pool: pg.Pool, beforeCall: () => Promise<void> = async () => {}) {
  const server = new McpServer({ name: 'homerelay', version: '0.1.0' });
  const register = (name: ToolName, run: (input: unknown) => Promise<unknown>) => {
    const definition = tools[name];
    server.registerTool(name, {
      description: `${name}: simulated household only; approval never overrides policy.`,
      inputSchema: definition.input as z.ZodType<Record<string, unknown>>,
      outputSchema: envelope(definition.output)
    }, async input => {
      try {
        await beforeCall();
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
}
