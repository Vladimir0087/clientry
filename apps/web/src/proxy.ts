import { randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { NONCE_HEADER } from '@/shared/lib/nonce';
import {
  isAuthPath,
  loginPath,
  NEXT_PARAM,
  resolveRedirectTarget,
} from '@/shared/lib/redirect-target';
import { verifyAccessToken } from '@/shared/lib/verify-access-token';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

const CSP_HEADER = 'Content-Security-Policy';
const NONCE_BYTES = 16;

function contentSecurityPolicy(nonce: string): string {
  // React's dev tooling rebuilds server error stacks with eval.
  const devScriptSource = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devScriptSource}`,
    // Radix positions menus through style attributes, which a nonce cannot cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function render(request: NextRequest): NextResponse {
  const nonce = randomBytes(NONCE_BYTES).toString('base64');
  const policy = contentSecurityPolicy(nonce);
  // Next takes the nonce for its own scripts from the CSP header of the request.
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_HEADER, policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CSP_HEADER, policy);
  return response;
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}

// Sends the user where they belong; the API, not this gate, authorizes every call.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search, searchParams, origin } = request.nextUrl;
  const session = await verifyAccessToken(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);
  if (isAuthPath(pathname)) {
    return session.status === 'authenticated'
      ? redirectTo(request, resolveRedirectTarget(searchParams.get(NEXT_PARAM), origin))
      : render(request);
  }
  return session.status === 'anonymous'
    ? redirectTo(request, loginPath(`${pathname}${search}`))
    : render(request);
}

export const config = {
  // No exclusion for prefetches: a prefetch renders the protected layout too.
  matcher: ['/((?!api(?:/|$)|_next/|favicon\\.ico$|icon\\.svg$).*)'],
};
