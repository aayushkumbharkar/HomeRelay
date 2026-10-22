import { openDb, migrate, schemaVersion } from '../src/db.js';
const db = openDb(process.env.DATABASE_URL!);
try { await migrate(db); console.log(`Migrations 1-${schemaVersion} applied or verified`); }
catch { console.error('Migration failed; check database availability and migration checksum'); process.exitCode = 1; }
finally { await db.end(); }
