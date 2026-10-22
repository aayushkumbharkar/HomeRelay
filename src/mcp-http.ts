import { createServer } from 'node:http';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler, localhostHostValidation } from '@modelcontextprotocol/node';

export async function listenMcp(factory: () => McpServer, token: string, port = 0) {
  if (token.length < 32) throw new Error('MCP_TOKEN must contain at least 32 characters');
  const handler = createMcpHandler(factory);
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: 16 * 1024 });
  const validHost = localhostHostValidation();
  const server = createServer((req, res) => {
    if (!validHost(req, res)) return;
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      res.writeHead(403).end(); return;
    }
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    void nodeHandler(req, res);
  });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Listener unavailable');
  return {
    port: address.port,
    async close() {
      await handler.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    }
  };
}
