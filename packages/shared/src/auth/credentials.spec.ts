import { describe, expect, it } from 'vitest';

import { loginRequestSchema, registerRequestSchema } from './credentials.js';

const VALID_REGISTRATION = {
  email: 'ann@studio.dev',
  password: 'correct horse battery',
  name: 'Ann',
  workspaceName: 'Pixel Studio',
};

function failedPaths(result: {
  readonly error?: { readonly issues: readonly { path: PropertyKey[] }[] };
}): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.map(String).join('.'));
}

function messagesOf(result: {
  readonly error?: { readonly issues: readonly { message: string }[] };
}): string[] {
  return (result.error?.issues ?? []).map(({ message }) => message);
}

describe('registerRequestSchema', () => {
  it('should trim and lowercase the email when it has spaces and capitals', () => {
    const result = registerRequestSchema.parse({
      ...VALID_REGISTRATION,
      email: ' Ann@Example.COM ',
    });

    expect(result.email).toBe('ann@example.com');
  });

  it('should reject the email when it is not an address', () => {
    const result = registerRequestSchema.safeParse({ ...VALID_REGISTRATION, email: 'ann@' });

    expect(failedPaths(result)).toEqual(['email']);
  });

  it('should reject the email when it is longer than 254 characters', () => {
    const email = `${'a'.repeat(245)}@studio.dev`;

    const result = registerRequestSchema.safeParse({ ...VALID_REGISTRATION, email });

    expect(failedPaths(result)).toEqual(['email']);
  });

  it.each([11, 129])('should reject the password when it has %i characters', (length) => {
    const result = registerRequestSchema.safeParse({
      ...VALID_REGISTRATION,
      password: 'p'.repeat(length),
    });

    expect(failedPaths(result)).toEqual(['password']);
  });

  it.each(['name', 'workspaceName'])(
    'should reject %s when it is blank after trimming',
    (field) => {
      const result = registerRequestSchema.safeParse({ ...VALID_REGISTRATION, [field]: '   ' });

      expect(failedPaths(result)).toEqual([field]);
    },
  );

  it('should keep the password as typed when it has surrounding spaces', () => {
    const password = '  spaced password  ';

    const result = registerRequestSchema.parse({ ...VALID_REGISTRATION, password });

    expect(result.password).toBe(password);
  });

  it('should read "Enter your email" when the email is empty', () => {
    const result = registerRequestSchema.safeParse({ ...VALID_REGISTRATION, email: '' });

    expect(messagesOf(result)).toEqual(['Enter your email']);
  });

  it('should read "Enter a valid email" when the email is not an address', () => {
    const result = registerRequestSchema.safeParse({ ...VALID_REGISTRATION, email: 'ann@' });

    expect(messagesOf(result)).toEqual(['Enter a valid email']);
  });

  it('should read "Use at least 12 characters" when the password has 11 characters', () => {
    const result = registerRequestSchema.safeParse({
      ...VALID_REGISTRATION,
      password: 'p'.repeat(11),
    });

    expect(messagesOf(result)).toEqual(['Use at least 12 characters']);
  });

  it('should read only "Enter your password" when the password is empty', () => {
    const result = registerRequestSchema.safeParse({ ...VALID_REGISTRATION, password: '' });

    expect(messagesOf(result)).toEqual(['Enter your password']);
  });

  it('should read "Use at most 128 characters" when the password is too long', () => {
    const result = registerRequestSchema.safeParse({
      ...VALID_REGISTRATION,
      password: 'p'.repeat(129),
    });

    expect(messagesOf(result)).toEqual(['Use at most 128 characters']);
  });

  it.each([
    ['name', 'Enter your name'],
    ['workspaceName', 'Enter a workspace name'],
  ])('should read the empty message when %s is blank', (field, message) => {
    const result = registerRequestSchema.safeParse({ ...VALID_REGISTRATION, [field]: '   ' });

    expect(messagesOf(result)).toEqual([message]);
  });
});

describe('loginRequestSchema', () => {
  it('should accept the password when it is shorter than the registration minimum', () => {
    const result = loginRequestSchema.safeParse({ email: 'ann@studio.dev', password: 'short' });

    expect(result.success).toBe(true);
  });

  it('should reject the password with "Enter your password" when it is empty', () => {
    const result = loginRequestSchema.safeParse({ email: 'ann@studio.dev', password: '' });

    expect(failedPaths(result)).toEqual(['password']);
    expect(messagesOf(result)).toEqual(['Enter your password']);
  });
});
