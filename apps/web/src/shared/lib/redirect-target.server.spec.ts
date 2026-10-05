import { describe, expect, it } from 'vitest';

import { loginPath, resolveRedirectTarget } from './redirect-target';

const APP_ORIGIN = 'http://localhost:3000';

describe('resolveRedirectTarget', () => {
  it.each(['/', '/clients?q=a'])('should keep %s when it is a same-origin page', (next) => {
    expect(resolveRedirectTarget(next, APP_ORIGIN)).toBe(next);
  });

  it.each([
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash after the slash', String.raw`/\evil.example`],
    ['a tab inside the double slash', '/\t/evil.example'],
    ['an absolute URL', 'https://evil.example'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['the login page', '/login'],
    ['the register page', '/register?next=/x'],
    ['an empty value', ''],
  ])('should fall back to / when next is %s', (_case, next) => {
    expect(resolveRedirectTarget(next, APP_ORIGIN)).toBe('/');
  });

  it.each([null, undefined])('should fall back to / when next is %s', (next) => {
    expect(resolveRedirectTarget(next, APP_ORIGIN)).toBe('/');
  });
});

describe('loginPath', () => {
  it('should omit next when the target is home', () => {
    expect(loginPath('/')).toBe('/login');
  });

  it('should carry the path and query in next when the target is another page', () => {
    expect(loginPath('/clients?q=a&page=2')).toBe('/login?next=%2Fclients%3Fq%3Da%26page%3D2');
  });
});
