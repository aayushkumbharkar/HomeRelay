import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startProcess } from '../helpers/processes.js';

test('real Streamable HTTP initializes, discovers, calls and rejects invalid arguments', async t => {
  const token = randomBytes(32).toString('hex');
  const process = await startProcess('dist/tests/helpers/probe-server.js', { MCP_TOKEN: token });
  t.after(() => process.stop());
  const client = new Client({ name: 'homerelay-proof-client', version: '0.1.0' });
  t.after(() => client.close());
  const transport = new StreamableHTTPClientTransport(new URL(`${process.url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }
  });
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, 'homerelay-proof');
  assert.ok(transport.protocolVersion && transport.protocolVersion >= '2025-11-25');
  t.diagnostic(`Negotiated MCP ${transport.protocolVersion}`);
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['simulation_info']);
  const result = await client.callTool({ name: 'simulation_info', arguments: { label: 'porch' } });
  assert.deepEqual(result.structuredContent, { label: 'porch', simulated: true });
  const invalid = await client.callTool({ name: 'simulation_info', arguments: { label: 42 } });
  assert.equal(invalid.isError, true);
});
