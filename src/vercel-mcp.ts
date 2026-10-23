import { openDb, schemaVersion } from './db.js';
import { mcpNodeHandler } from './mcp-http.js';
import { createHomeRelayServer } from './mcp-tools.js';
import { vercelHosts } from './vercel-env.js';

// Vercel function: stateless Streamable HTTP MCP endpoint. Migrations are an explicit
// procedure; each instance only verifies the schema version once and fails closed.
const pool = openDb(process.env.DATABASE_URL ?? '');
let schema: Promise<void> | null = null;
const ensureSchema = () => schema ??= pool.query('SELECT version FROM schema_migrations WHERE version=$1', [schemaVersion])
  .then(result => { if (!result.rowCount) throw new Error('Migration required'); })
  .catch(error => { schema = null; throw error; });
const mcp = mcpNodeHandler(() => createHomeRelayServer(pool, ensureSchema), process.env.MCP_TOKEN ?? '',
  { hosts: vercelHosts(), scheme: process.env.PUBLIC_SCHEME, health: async () => { await pool.query('SELECT 1'); } });
export default mcp.handle;
