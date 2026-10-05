import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

import { getWebEnv } from './src/shared/config/env.ts';
import { loadRootEnv } from './src/shared/config/load-root-env.ts';

loadRootEnv(fileURLToPath(new URL('../../.env', import.meta.url)));
const { apiUrl } = getWebEnv();

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  // Otherwise next dev writes AGENTS.md and CLAUDE.md into the app when an AI agent runs it.
  agentRules: false,
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
  headers() {
    // Proxied API responses keep the API's own headers.
    return Promise.resolve([{ source: '/((?!api(?:/|$)).*)', headers: SECURITY_HEADERS }]);
  },
};

export default nextConfig;
