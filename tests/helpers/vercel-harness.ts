// Serves the packaged Vercel Build Output functions with Vercel-style routing for tests:
// /mcp -> functions/api/mcp.func, /healthz and /api/* -> functions/api/web.func.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;
const output = resolve(process.env.VERCEL_OUTPUT ?? '.vercel/output/functions/api');
let web: Handler | undefined, mcp: Handler | undefined;
const server = createServer((req, res) => {
  const path = new URL(req.url!, 'http://local').pathname;
  const target = path === '/mcp' ? mcp : path === '/healthz' || path.startsWith('/api/') ? web : undefined;
  if (!target) { res.writeHead(404).end(); return; }
  void target(req, res);
});
await new Promise<void>(r => server.listen(Number(process.env.HARNESS_PORT ?? 0), '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
process.env.PUBLIC_HOSTS = `127.0.0.1:${port}`;
process.env.PUBLIC_SCHEME = 'http';
process.env.MCP_URL ??= `http://127.0.0.1:${port}/mcp`;
const load = async (name: string) => (await import(pathToFileURL(`${output}/${name}.func/index.mjs`).href)).default as Handler;
mcp = await load('mcp'); web = await load('web');
process.send?.({ port });
