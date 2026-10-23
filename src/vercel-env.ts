import { createHmac } from 'node:crypto';

// Hosts this deployment answers on: Vercel system variables plus an explicit PUBLIC_HOSTS list.
export const vercelHosts = () => [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ...(process.env.PUBLIC_HOSTS ?? '').split(',')].map(host => host?.trim()).filter((host): host is string => !!host);

// Serverless instances share no memory, so the CSRF token is derived from a server-side secret.
// Same-origin checks still apply; the token only proves the caller read /api/session same-origin.
export function csrfToken() {
  const secret = process.env.CSRF_SECRET ?? '';
  if (secret.length < 32) throw new Error('CSRF_SECRET must contain at least 32 characters');
  return createHmac('sha256', secret).update('homerelay-csrf-v1').digest('hex');
}

// Preview code calls its own deployment's MCP; production calls the production domain.
export const defaultMcpUrl = () => {
  const host = process.env.VERCEL_ENV === 'production' ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  return host ? `https://${host}/mcp` : undefined;
};
