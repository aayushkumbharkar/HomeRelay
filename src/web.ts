import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { callMcp } from './mcp-client.js';
import { DomainError } from './contracts.js';

const publicOrigin = process.env.RENDER_EXTERNAL_URL ? new URL(process.env.RENDER_EXTERNAL_URL).origin : undefined;
const csrfToken = randomBytes(32).toString('hex');
const send = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
};
async function body(req: IncomingMessage) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new DomainError('INVALID_INPUT');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DomainError('INVALID_INPUT'); }
}
const server = createServer((req, res) => { void (async () => {
  try {
    if (!req.headers.host || (publicOrigin ? req.headers.host !== new URL(publicOrigin).host : !/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host))) { send(res, 403, { error: 'FORBIDDEN' }); return; }
    const path = new URL(req.url!, `http://${req.headers.host}`).pathname;
    if (req.method === 'GET') {
      if (path === '/healthz') { send(res,200,{status:'ok',service:'web'}); return; }
      const assets: Record<string, [string,string]> = {'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
      if (assets[path]) { const [file, mime] = assets[path]; res.writeHead(200, {'Content-Type': mime+'; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}); res.end(await readFile('public/'+file)); return; }
      if (path === '/api/home') { send(res,200,await callMcp('get_home',{})); return; }
      if (path === '/api/history') { send(res,200,await callMcp('list_decisions',{})); return; }
      if (path === '/api/session') { send(res, 200, { csrfToken }); return; }
      if (path.startsWith('/api/routines/')) { send(res, 200, await callMcp('get_routine', { routineRevisionId: decodeURIComponent(path.slice(14)) })); return; }
      if (path.startsWith('/api/incidents/')) { send(res, 200, await callMcp('reconstruct_incident', { eventId: decodeURIComponent(path.slice(15)) })); return; }
      if (path.startsWith('/api/preflight/')) { send(res, 200, await callMcp('get_preflight_run', { runId: decodeURIComponent(path.slice(15)) })); return; }
      if (path.startsWith('/api/decisions/')) { send(res, 200, await callMcp('get_decision', { eventId: decodeURIComponent(path.slice(15)) })); return; }
      send(res, 404, { error: 'NOT_FOUND' }); return;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'METHOD_NOT_ALLOWED' }); return; }
    if (req.headers.origin !== (publicOrigin ?? `http://${req.headers.host}`) || req.headers['x-csrf-token'] !== csrfToken) { send(res, 403, { error: 'FORBIDDEN' }); return; }
    if (Number(req.headers['content-length']) > 16384) { send(res, 413, { error: 'BODY_TOO_LARGE' }); return; }
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') { send(res, 415, { error: 'JSON_REQUIRED' }); return; }
    if (path === '/api/approve') send(res, 200, await callMcp('approve_routine', await body(req)));
    else if (path === '/api/events') send(res, 200, await callMcp('simulate_event', await body(req)));
    else if (path === '/api/preflight') send(res, 200, await callMcp('run_preflight', await body(req)));
    else send(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? 'INVALID_INPUT' : 'UNAVAILABLE';
    const status = { INVALID_INPUT: 400, NOT_FOUND: 404, STALE_REVISION: 409, IDEMPOTENCY_CONFLICT: 409, UNAVAILABLE: 503 }[code];
    send(res, status, { error: code });
  }
})(); });
server.listen(Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000), process.env.BIND_HOST ?? '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    process.send?.({ port: address.port });
    console.log(`HomeRelay backend listening on ${process.env.BIND_HOST ?? "127.0.0.1"}:${address.port}; simulated devices only`);
  }
});
const stop = () => { server.closeAllConnections(); server.close(); };
process.once('SIGTERM', stop); process.once('SIGINT', stop);
