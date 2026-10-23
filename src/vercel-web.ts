import { createWebHandler } from './web-handler.js';
import { csrfToken, defaultMcpUrl, vercelHosts } from './vercel-env.js';

// Vercel function: the web API. Static assets are served by Vercel's CDN, not here.
process.env.MCP_URL ??= defaultMcpUrl();
export default createWebHandler({ csrfToken: csrfToken(), hosts: vercelHosts(), scheme: process.env.PUBLIC_SCHEME, assets: false });
