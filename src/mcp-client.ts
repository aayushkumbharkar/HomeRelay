import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { DomainError, tools, envelope, type ToolName } from './contracts.js';

export async function callMcp(name: ToolName, input: unknown) {
  const definition = tools[name];
  const args = definition.input.parse(input);
  const client = new Client({ name: 'homerelay-web', version: '0.1.0' });
  try {
    const transport = new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? new URL('/mcp', process.env.MCP_BASE_URL!).href), {
      requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } },
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.any([
        AbortSignal.timeout(5000), ...(init?.signal ? [init.signal] : [])
      ]) })
    });
    await client.connect(transport);
    if (!transport.protocolVersion || transport.protocolVersion < '2025-11-25') throw new DomainError('UNAVAILABLE');
    const result = await client.callTool({ name, arguments: args }, { timeout: 5000 });
    const parsed = envelope(definition.output).parse(result.structuredContent);
    if (parsed.error) throw new DomainError(parsed.error);
    if (result.isError || parsed.value === null) throw new DomainError('UNAVAILABLE');
    return parsed.value;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('UNAVAILABLE');
  } finally { await client.close().catch(() => {}); }
}
