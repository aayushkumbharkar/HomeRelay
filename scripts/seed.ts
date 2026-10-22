import { openDb } from '../src/db.js';
import { seed } from '../src/fixtures.js';
const db = openDb(process.env.DATABASE_URL!);
try { await seed(db); console.log('Seeded simulated devices and unapproved routine; existing state preserved'); }
catch { console.error('Seed failed; check database and migrations'); process.exitCode = 1; }
finally { await db.end(); }
