import { describe, expect, it } from 'vitest';

import {
  inviteLoginRequestSchema,
  inviteRegisterRequestSchema,
  inviteTokenSchema,
} from './invite.js';

const TOKEN = 'q3V8Hn1xKZ0bWcR5tYp2LmA9sEoJfDgU7iNvXwC4hBk';

const VALID_REGISTRATION = {
  token: TOKEN,
  name: 'Max',
  email: 'max@studio.dev',
  password: 'correct horse battery',
};

function messagesOf(result: {
  readonly error?: { readonly issues: readonly { message: string }[] };
}): string[] {
  return (result.error?.issues ?? []).map(({ message }) => message);
}

function failedPaths(result: {
  readonly error?: { readonly issues: readonly { path: PropertyKey[] }[] };
}): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.map(String).join('.'));
}

describe('inviteTokenSchema', () => {
  it('should accept the token when it has 43 base64url characters', () => {
    expect(inviteTokenSchema.safeParse(TOKEN).success).toBe(true);
  });

  it.each([
    ['42 characters', TOKEN.slice(1)],
    ['44 characters', `${TOKEN}A`],
    ['a plus sign', `+${TOKEN.slice(1)}`],
    ['a slash', `/${TOKEN.slice(1)}`],
    ['padding', `${TOKEN.slice(1)}=`],
  ])('should read "Invalid invite link" when the token has %s', (_case, token) => {
    expect(messagesOf(inviteTokenSchema.safeParse(token))).toEqual(['Invalid invite link']);
  });
});

describe('inviteRegisterRequestSchema', () => {
  it('should accept the request when every field is valid', () => {
    expect(inviteRegisterRequestSchema.safeParse(VALID_REGISTRATION).success).toBe(true);
  });

  it.each([
    ['name', '   ', 'Enter your name'],
    ['email', 'max@', 'Enter a valid email'],
    ['password', 'p'.repeat(11), 'Use at least 12 characters'],
  ])('should reject %s with the registration message when it is invalid', (field, value, text) => {
    const result = inviteRegisterRequestSchema.safeParse({ ...VALID_REGISTRATION, [field]: value });

    expect(failedPaths(result)).toEqual([field]);
    expect(messagesOf(result)).toEqual([text]);
  });

  it('should reject the request on token when the token is missing', () => {
    const result = inviteRegisterRequestSchema.safeParse({
      ...VALID_REGISTRATION,
      token: undefined,
    });

    expect(failedPaths(result)).toEqual(['token']);
  });
});

describe('inviteLoginRequestSchema', () => {
  const login = { token: TOKEN, email: 'max@studio.dev', password: 'short' };

  it('should accept the password when it is shorter than the registration minimum', () => {
    expect(inviteLoginRequestSchema.safeParse(login).success).toBe(true);
  });

  it('should read "Enter a valid email" when the email is not an address', () => {
    const result = inviteLoginRequestSchema.safeParse({ ...login, email: 'max@' });

    expect(messagesOf(result)).toEqual(['Enter a valid email']);
  });

  it('should read "Enter your password" when the password is empty', () => {
    const result = inviteLoginRequestSchema.safeParse({ ...login, password: '' });

    expect(messagesOf(result)).toEqual(['Enter your password']);
  });

  it('should reject the request on token when the token is missing', () => {
    const result = inviteLoginRequestSchema.safeParse({ ...login, token: undefined });

    expect(failedPaths(result)).toEqual(['token']);
  });
});
