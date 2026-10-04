import { describe, expect, it } from 'vitest';

import { TrustedOriginGuard } from './trusted-origin.guard.js';
import { UntrustedOriginError } from './untrusted-origin.error.js';
import { createHttpContext } from '../../../test/support/http-context.js';
import type { FakeRequest } from '../../../test/support/http-context.js';
import { TRUSTED_ORIGIN } from '../../../test/support/test-env.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';

class FixtureController {
  handle(): void {
    // route body is irrelevant to the guard
  }
}

describe('TrustedOriginGuard', () => {
  const guard = new TrustedOriginGuard(createUnitConfig());

  function canActivate(fake: FakeRequest): boolean {
    const { context } = createHttpContext(FixtureController, 'handle', fake);
    return guard.canActivate(context);
  }

  it('should pass a GET when the origin is not trusted', () => {
    expect(canActivate({ method: 'GET', headers: { origin: 'https://evil.example' } })).toBe(true);
  });

  it('should pass a POST when the origin is trusted', () => {
    expect(canActivate({ method: 'POST', headers: { origin: TRUSTED_ORIGIN } })).toBe(true);
  });

  it('should pass a POST when no origin is sent', () => {
    expect(canActivate({ method: 'POST' })).toBe(true);
  });

  it.each(['https://evil.example', 'null'])(
    'should reject a POST when the origin is %s',
    (origin) => {
      expect(() => canActivate({ method: 'POST', headers: { origin } })).toThrow(
        UntrustedOriginError,
      );
    },
  );
});
