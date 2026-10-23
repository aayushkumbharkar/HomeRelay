// Emits Vercel Build Output API v3 from the compiled project (run after `tsc`).
// static/ <- public/, functions/api/{web,mcp}.func <- dist/src + production dependency closure.
// Copies no environment files or secrets; configuration comes from Vercel environment variables.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve('.'), out = join(root, '.vercel/output');
const securityHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
if (!existsSync(join(root, 'dist/src/vercel-web.js'))) throw new Error('Run `npm run build` first');

// Resolve the runtime dependency closure the way Node does (nested node_modules first, then parents).
function resolvePackage(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === root || dirname(dir) === dir) return null;
  }
}
const closure = new Set();
(function walk(pkgDir) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  for (const [name, optional] of [...Object.keys(pkg.dependencies ?? {}).map(n => [n, false]), ...Object.keys(pkg.optionalDependencies ?? {}).map(n => [n, true])]) {
    const dir = resolvePackage(name, pkgDir);
    if (!dir) { if (optional) continue; throw new Error(`Missing production dependency ${name}`); }
    if (closure.has(dir)) continue;
    closure.add(dir); walk(dir);
  }
})(root);

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'public'), join(out, 'static'), { recursive: true });
for (const name of ['web', 'mcp']) {
  const fn = join(out, 'functions/api', `${name}.func`);
  mkdirSync(fn, { recursive: true });
  cpSync(join(root, 'dist/src'), join(fn, 'dist/src'), { recursive: true });
  for (const dir of closure) cpSync(dir, join(fn, relative(root, dir)), { recursive: true });
  writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(fn, 'index.mjs'), `export { default } from './dist/src/vercel-${name}.js';\n`);
  writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs',
    shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 30 }, null, 2));
}
writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/(.*)', headers: securityHeaders, continue: true },
  { handle: 'filesystem' },
  { src: '/mcp', dest: '/api/mcp' },
  { src: '/healthz', dest: '/api/web' },
  { src: '/api/(.*)', dest: '/api/web' }
] }, null, 2));
console.log(`Vercel Build Output written: static + 2 functions (${closure.size} runtime packages)`);
