import { describe, expect, it } from 'vitest';

import { createClientRequestSchema, updateClientRequestSchema } from './client-request.js';

const NUL = String.fromCharCode(0);

interface Issues {
  readonly error?: { readonly issues: readonly { path: PropertyKey[]; message: string }[] };
}

function failedPaths(result: Issues): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.map(String).join('.'));
}

function messagesOf(result: Issues): string[] {
  return (result.error?.issues ?? []).map(({ message }) => message);
}

function parseCreate(
  fields: Record<string, unknown>,
): ReturnType<typeof createClientRequestSchema.safeParse> {
  return createClientRequestSchema.safeParse({ name: 'Romashka LLC', ...fields });
}

describe('createClientRequestSchema', () => {
  it('should trim the name when it has surrounding spaces', () => {
    const result = createClientRequestSchema.parse({ name: '  Romashka  ' });

    expect(result.name).toBe('Romashka');
  });

  it('should read "Enter a name" when the name is blank', () => {
    const result = createClientRequestSchema.safeParse({ name: '   ' });

    expect(messagesOf(result)).toEqual(['Enter a name']);
  });

  it('should read "Use at most 200 characters" when the name has 201 characters', () => {
    const result = createClientRequestSchema.safeParse({ name: 'n'.repeat(201) });

    expect(messagesOf(result)).toEqual(['Use at most 200 characters']);
  });

  it.each(['', null])('should accept the email when it is %j', (email) => {
    expect(parseCreate({ email }).success).toBe(true);
  });

  it('should trim and lowercase the email when it has spaces and capitals', () => {
    const result = createClientRequestSchema.parse({ name: 'Ann', email: ' Ann@X.COM ' });

    expect(result.email).toBe('ann@x.com');
  });

  it('should read "Enter a valid email" when the email is not an address', () => {
    expect(messagesOf(parseCreate({ email: 'ann@' }))).toEqual(['Enter a valid email']);
  });

  it('should accept the phone when it has a plus, brackets, spaces and dashes', () => {
    expect(parseCreate({ phone: '+375 (29) 123-45-67' }).success).toBe(true);
  });

  it.each([
    ['has four digits', '12-34'],
    ['has letters', 'abc'],
    ['has 33 characters', '1'.repeat(33)],
    ['has two leading pluses', '++375291234567'],
    ['has a line break', '+375\n29 123-45-67'],
  ])('should reject the phone when it %s', (_case, phone) => {
    expect(failedPaths(parseCreate({ phone }))).toEqual(['phone']);
  });

  it('should reject the source when it is unknown', () => {
    expect(failedPaths(parseCreate({ source: 'fax' }))).toEqual(['source']);
  });

  it('should accept the source when it is null', () => {
    expect(parseCreate({ source: null }).success).toBe(true);
  });

  it('should trim and lowercase a tag when it has spaces and capitals', () => {
    const result = createClientRequestSchema.parse({ name: 'Ann', tags: [' VIP '] });

    expect(result.tags).toEqual(['vip']);
  });

  it('should read "Tags must be unique" on the repeat when tags differ only in case', () => {
    const result = parseCreate({ tags: ['VIP', 'vip'] });

    expect(failedPaths(result)).toEqual(['tags.1']);
    expect(messagesOf(result)).toEqual(['Tags must be unique']);
  });

  it('should read "Use at most 10 tags" when there are 11 tags', () => {
    const tags = Array.from({ length: 11 }, (_, index) => `tag-${String(index)}`);

    expect(messagesOf(parseCreate({ tags }))).toEqual(['Use at most 10 tags']);
  });

  it('should reject a tag when it has 33 characters', () => {
    expect(failedPaths(parseCreate({ tags: ['t'.repeat(33)] }))).toEqual(['tags.0']);
  });

  it('should read "Tags cannot contain commas" when a tag has a comma', () => {
    expect(messagesOf(parseCreate({ tags: ['a,b'] }))).toEqual(['Tags cannot contain commas']);
  });

  it('should reject the notes when they contain a NUL character', () => {
    expect(failedPaths(parseCreate({ notes: `call${NUL}back` }))).toEqual(['notes']);
  });

  it('should reject the notes when they have 5001 characters', () => {
    expect(failedPaths(parseCreate({ notes: 'n'.repeat(5001) }))).toEqual(['notes']);
  });

  it('should keep line breaks inside the notes when they are trimmed', () => {
    const result = createClientRequestSchema.parse({ name: 'Ann', notes: ' first\nsecond ' });

    expect(result.notes).toBe('first\nsecond');
  });

  it('should drop unknown keys when the body carries them', () => {
    const result = createClientRequestSchema.parse({ name: 'Ann', workspaceId: 'other' });

    expect(result).toEqual({ name: 'Ann' });
  });
});

describe('updateClientRequestSchema', () => {
  it('should accept the body when it is empty', () => {
    expect(updateClientRequestSchema.safeParse({}).success).toBe(true);
  });

  it.each(['', null])('should reject the name when it is %j', (name) => {
    expect(failedPaths(updateClientRequestSchema.safeParse({ name }))).toEqual(['name']);
  });

  it('should accept the company when it is null', () => {
    expect(updateClientRequestSchema.safeParse({ company: null }).success).toBe(true);
  });
});
