import { McpServer } from '@modelcontextprotocol/server';
import { listenMcp } from '../../src/mcp-http.js';
import { z } from 'zod';

const listener = await listenMcp(() => {
  const server = new McpServer({ name: 'homerelay-proof', version: '0.1.0' });
  server.registerTool('simulation_info', {
    description: 'Describe the explicitly simulated proof target.',
    inputSchema: z.strictObject({ label: z.string().min(1).max(80) }),
    outputSchema: z.strictObject({ label: z.string(), simulated: z.literal(true) })
  }, async ({ label }) => ({
    content: [{ type: 'text', text: 'Simulated device only' }],
    structuredContent: { label, simulated: true }
  }));
  return server;
}, process.env.MCP_TOKEN!);
process.send?.({ port: listener.port });
