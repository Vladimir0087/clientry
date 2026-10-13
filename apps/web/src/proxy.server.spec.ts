import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import { config, proxy } from './proxy';
import { createAccessToken } from '../test/tokens';

type SessionKind = 'authenticated' | 'expired' | 'anonymous';

const APP_ORIGIN = 'http://localhost:3000';

async function accessCookie(kind: SessionKind): Promise<string | undefined> {
  if (kind === 'anonymous') {
    return undefined;
  }
  return createAccessToken(kind === 'expired' ? { expiresInSeconds: -60 } : {});
}

async function requestAs(kind: SessionKind, path: string): Promise<NextRequest> {
  const token = await accessCookie(kind);
  const headers = token === undefined ? undefined : { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` };
  return new NextRequest(new URL(path, APP_ORIGIN), { headers });
}

async function run(kind: SessionKind, path: string): Promise<Response> {
  return proxy(await requestAs(kind, path));
}

function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');
  if (location === null) {
    return null;
  }
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

function isRendered(response: Response): boolean {
  return response.headers.get('x-middleware-next') === '1';
}

function nonceOf(policy: string | null): string | undefined {
  return policy?.match(/'nonce-([^']+)'/)?.[1];
}

describe('proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('session gate', () => {
    it.each<SessionKind>(['authenticated', 'expired'])(
      'should render a protected page when the session is %s',
      async (kind) => {
        const response = await run(kind, '/');

        expect(isRendered(response)).toBe(true);
      },
    );

    it('should redirect to /login without next when an anonymous user opens /', async () => {
      const response = await run('anonymous', '/');

      expect(redirectTarget(response)).toBe('/login');
    });

    it('should carry the path and query in next when an anonymous user opens another page', async () => {
      const response = await run('anonymous', '/anything?x=1');

      expect(redirectTarget(response)).toBe('/login?next=%2Fanything%3Fx%3D1');
    });

    it.each(['/login', '/register'])(
      'should redirect an authenticated user to / when they open %s',
      async (path) => {
        const response = await run('authenticated', path);

        expect(redirectTarget(response)).toBe('/');
      },
    );

    it.each([
      ['/x', '/login?next=/x'],
      ['/', '/login?next=//evil.example'],
    ])('should redirect to %s when an authenticated user opens %s', async (target, path) => {
      const response = await run('authenticated', path);

      expect(redirectTarget(response)).toBe(target);
    });

    it.each<[SessionKind, string]>([
      ['expired', '/login'],
      ['expired', '/register'],
      ['anonymous', '/login'],
      ['anonymous', '/register'],
    ])('should render the auth page when the session is %s on %s', async (kind, path) => {
      const response = await run(kind, path);

      expect(isRendered(response)).toBe(true);
    });
  });

  describe('join page', () => {
    it.each<SessionKind>(['anonymous', 'expired', 'authenticated'])(
      'should render /join without a redirect when the session is %s',
      async (kind) => {
        const response = await run(kind, '/join');

        expect(isRendered(response)).toBe(true);
        expect(redirectTarget(response)).toBeNull();
      },
    );
  });

  describe('content security policy', () => {
    it('should forward the nonce of its policy to rendering when a page renders', async () => {
      const response = await run('authenticated', '/');

      const nonce = nonceOf(response.headers.get('content-security-policy'));
      expect(nonce).toBeDefined();
      expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
      expect(nonceOf(response.headers.get('x-middleware-request-content-security-policy'))).toBe(
        nonce,
      );
    });

    it('should use a new nonce when another request comes in', async () => {
      const first = await run('authenticated', '/');
      const second = await run('authenticated', '/');

      const firstNonce = nonceOf(first.headers.get('content-security-policy'));
      expect(nonceOf(second.headers.get('content-security-policy'))).not.toBe(firstNonce);
    });

    it('should allow unsafe-eval when not in production', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const response = await run('anonymous', '/login');

      expect(response.headers.get('content-security-policy')).toContain("'unsafe-eval'");
    });

    it('should forbid unsafe-eval when in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const response = await run('anonymous', '/login');

      const policy = response.headers.get('content-security-policy');
      expect(policy).toContain("script-src 'self' 'nonce-");
      expect(policy).not.toContain("'unsafe-eval'");
    });
  });

  describe('matcher', () => {
    it.each(['/api/auth/me', '/_next/static/chunk.js', '/icon.svg'])(
      'should not run when the path is %s',
      (url) => {
        expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
      },
    );

    it.each(['/', '/apiary', '/clients?q=a'])('should run when the path is %s', (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    });

    it('should run when the request is a router prefetch', () => {
      const headers = { 'next-router-prefetch': '1' };

      expect(unstable_doesMiddlewareMatch({ config, url: '/', headers })).toBe(true);
    });
  });
});
