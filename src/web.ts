import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createWebHandler } from './web-handler.js';

// Standalone listener for local development and Render.
const publicOrigin = process.env.RENDER_EXTERNAL_URL ? new URL(process.env.RENDER_EXTERNAL_URL).origin : undefined;
const server = createServer(createWebHandler({ csrfToken: randomBytes(32).toString('hex'), publicOrigin }));
server.listen(Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000), process.env.BIND_HOST ?? '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    process.send?.({ port: address.port });
    console.log(`HomeRelay backend listening on ${process.env.BIND_HOST ?? "127.0.0.1"}:${address.port}; simulated devices only`);
  }
});
const stop = () => { server.closeAllConnections(); server.close(); };
process.once('SIGTERM', stop); process.once('SIGINT', stop);
