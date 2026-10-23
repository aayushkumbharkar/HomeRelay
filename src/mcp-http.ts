import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler, localhostHostValidation } from '@modelcontextprotocol/node';

export type McpGuardOptions = { publicOrigin?: string; hosts?: string[]; scheme?: string; health?: () => Promise<void> };

// Guarded, stateless official-SDK Streamable HTTP handler shared by the standalone listener
// (local/Render) and the Vercel function. Host/Origin, path, bearer token and body size are
// checked before the SDK sees the request.
export function mcpNodeHandler(factory: () => McpServer, token: string, options: McpGuardOptions = {}) {
  if (!token || token.length < 32) throw new Error('MCP_TOKEN must contain at least 32 characters');
  const handler = createMcpHandler(factory);
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: 16 * 1024 });
  const validHost = localhostHostValidation();
  const hosts = options.hosts ?? [];
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const host = req.headers.host ?? '';
    let origin: string;
    if (options.publicOrigin) { if (host !== new URL(options.publicOrigin).host) { res.writeHead(403).end(); return; } origin = options.publicOrigin; }
    else if (hosts.includes(host)) origin = `${options.scheme ?? 'https'}://${host}`;
    else { if (!validHost(req, res)) return; origin = `http://${host}`; }
    const path = new URL(req.url ?? '/', 'http://local').pathname;
    if (req.method === 'GET' && path === '/healthz') {
      void (options.health?.() ?? Promise.resolve()).then(() => res.writeHead(200).end('ok')).catch(() => res.writeHead(503).end('unavailable')); return;
    }
    if (req.headers.origin && req.headers.origin !== origin) { res.writeHead(403).end(); return; }
    if (path !== '/mcp' && path !== '/api/mcp') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    void nodeHandler(req, res);
  };
  return { handle, close: () => handler.close() };
}

export async function listenMcp(factory: () => McpServer, token: string, port = 0, options: { host?: string; publicOrigin?: string; health?: () => Promise<void> } = {}) {
  const mcp = mcpNodeHandler(factory, token, { publicOrigin: options.publicOrigin, health: options.health });
  const server = createServer(mcp.handle);
  await new Promise<void>(resolve => server.listen(port, options.host ?? '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Listener unavailable');
  return {
    port: address.port,
    async close() {
      await mcp.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    }
  };
}
