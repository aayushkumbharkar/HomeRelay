import { openDb, schemaVersion } from './db.js';
import { listenMcp } from './mcp-http.js';
import { createHomeRelayServer } from './mcp-tools.js';

const pool = openDb(process.env.DATABASE_URL!);
try {
  const migration = await pool.query('SELECT version FROM schema_migrations WHERE version=$1', [schemaVersion]);
  if (!migration.rowCount) throw new Error('Migration required');
  const listener = await listenMcp(() => createHomeRelayServer(pool),
    process.env.MCP_TOKEN!, Number(process.env.PORT ?? process.env.MCP_PORT ?? 3001), {host: process.env.BIND_HOST, publicOrigin: process.env.RENDER_EXTERNAL_URL, health: async () => { await pool.query('SELECT 1'); }});
  process.send?.({ port: listener.port });
  console.log(`HomeRelay simulated MCP listening on ${process.env.BIND_HOST ?? "127.0.0.1"}:${listener.port}`);
  const stop = async () => { await listener.close(); await pool.end(); };
  process.once('SIGTERM', () => void stop()); process.once('SIGINT', () => void stop());
} catch { await pool.end(); console.error('MCP startup failed; check database, migrations, token and port'); process.exitCode = 1; }
