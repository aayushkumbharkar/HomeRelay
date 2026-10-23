import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { callMcp } from './mcp-client.js';
import { DomainError } from './contracts.js';

export type WebOptions = { csrfToken: string; publicOrigin?: string; hosts?: string[]; scheme?: string; assets?: boolean };

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
export const securityHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };

// The web backend: no database or policy imports; every domain call goes through the MCP client.
export function createWebHandler(options: WebOptions) {
  const { csrfToken, publicOrigin, hosts = [] } = options;
  const allowedOrigin = (host: string) => publicOrigin ?? (hosts.includes(host) ? `${options.scheme ?? 'https'}://${host}` : `http://${host}`);
  const hostAllowed = (host: string | undefined) => !!host && (publicOrigin ? host === new URL(publicOrigin).host
    : hosts.includes(host) || /^(127\.0\.0\.1|localhost):\d+$/.test(host));
  return (req: IncomingMessage, res: ServerResponse) => { void (async () => {
    try {
      if (!hostAllowed(req.headers.host)) { send(res, 403, { error: 'FORBIDDEN' }); return; }
      const host = req.headers.host!;
      const path = new URL(req.url!, `http://${host}`).pathname;
      if (req.method === 'GET') {
        if (path === '/healthz') { send(res,200,{status:'ok',service:'web',checks:'process liveness only; see /api/ready'}); return; }
        // End-to-end readiness: one read-only MCP call that reaches PostgreSQL. No internal detail is returned.
        if (path === '/api/ready') { await callMcp('get_home',{}); send(res,200,{status:'ready',checked:'web, MCP, PostgreSQL (read-only)'}); return; }
        const assets: Record<string, [string,string]> = {'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
        if (options.assets !== false && assets[path]) { const [file, mime] = assets[path]; res.writeHead(200, {'Content-Type': mime+'; charset=utf-8', ...securityHeaders}); res.end(await readFile('public/'+file)); return; }
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
      if (req.headers.origin !== allowedOrigin(host) || req.headers['x-csrf-token'] !== csrfToken) { send(res, 403, { error: 'FORBIDDEN' }); return; }
      if (Number(req.headers['content-length']) > 16384) { send(res, 413, { error: 'BODY_TOO_LARGE' }); return; }
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') { send(res, 415, { error: 'JSON_REQUIRED' }); return; }
      if (path === '/api/approve') send(res, 200, await callMcp('approve_routine', await body(req)));
      else if (path === '/api/events') send(res, 200, await callMcp('simulate_event', await body(req)));
      else if (path === '/api/preflight') send(res, 200, await callMcp('run_preflight', await body(req)));
      else send(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? 'INVALID_INPUT' : 'UNAVAILABLE';
      const status = { INVALID_INPUT: 400, NOT_FOUND: 404, STALE_REVISION: 409, IDEMPOTENCY_CONFLICT: 409, UNAVAILABLE: 503, UPSTREAM_REJECTED: 502 }[code];
      send(res, status, { error: code });
    }
  })(); };
}
