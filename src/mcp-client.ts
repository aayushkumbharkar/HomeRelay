import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { DomainError, tools, envelope, type ToolName } from './contracts.js';

export async function callMcp(name: ToolName, input: unknown) {
  const definition = tools[name];
  const args = definition.input.parse(input);
  const client = new Client({ name: 'homerelay-web', version: '0.1.0' });
  const timeout = Number(process.env.MCP_TIMEOUT_MS ?? 5000);
  // Vercel deployment protection: server-side bypass secret for protected preview URLs, never sent to browsers.
  const bypass: Record<string, string> = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};
  // A 401/403 from MCP is a persistent configuration fault (token mismatch), not a wake-up delay.
  let rejected = false;
  try {
    const transport = new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? new URL('/mcp', process.env.MCP_BASE_URL!).href), {
      requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}`, ...bypass } },
      fetch: async (url, init) => {
        const response = await fetch(url, { ...init, signal: AbortSignal.any([
          AbortSignal.timeout(timeout), ...(init?.signal ? [init.signal] : [])
        ]) });
        if (response.status === 401 || response.status === 403) rejected = true;
        return response;
      }
    });
    await client.connect(transport);
    if (!transport.protocolVersion || transport.protocolVersion < '2025-11-25') throw new DomainError('UNAVAILABLE');
    const result = await client.callTool({ name, arguments: args }, { timeout });
    const parsed = envelope(definition.output).parse(result.structuredContent);
    if (parsed.error) throw new DomainError(parsed.error);
    if (result.isError || parsed.value === null) throw new DomainError('UNAVAILABLE');
    return parsed.value;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(rejected ? 'UPSTREAM_REJECTED' : 'UNAVAILABLE');
  } finally { await client.close().catch(() => {}); }
}
