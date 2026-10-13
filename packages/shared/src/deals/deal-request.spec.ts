import { describe, expect, it } from 'vitest';

import {
  boardQuerySchema,
  createDealRequestSchema,
  moveDealRequestSchema,
  updateDealRequestSchema,
} from './deal-request.js';

const CLIENT_ID = '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b';
const STAGE_ID = '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c';
const MEMBER_ID = '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

const VALID_DEAL = {
  title: 'Landing page for Romashka',
  clientId: CLIENT_ID,
  stageId: STAGE_ID,
  amount: 150_000,
  currency: 'USD',
  assigneeId: MEMBER_ID,
};

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
): ReturnType<typeof createDealRequestSchema.safeParse> {
  return createDealRequestSchema.safeParse({ ...VALID_DEAL, ...fields });
}

describe('createDealRequestSchema', () => {
  it('should trim the title when it has surrounding spaces', () => {
    expect(createDealRequestSchema.parse({ ...VALID_DEAL, title: '  Landing  ' }).title).toBe(
      'Landing',
    );
  });

  it('should read "Enter a title" when the title is blank', () => {
    expect(messagesOf(parseCreate({ title: '   ' }))).toEqual(['Enter a title']);
  });

  it('should read "Use at most 200 characters" when the title has 201 characters', () => {
    expect(messagesOf(parseCreate({ title: 't'.repeat(201) }))).toEqual([
      'Use at most 200 characters',
    ]);
  });

  it('should accept the amount when it is zero', () => {
    expect(parseCreate({ amount: 0 }).success).toBe(true);
  });

  it.each([
    [-1, 'Amount cannot be negative'],
    [1.5, 'Enter an amount'],
    [100_000_000_001, 'Use an amount up to 1,000,000,000'],
    [undefined, 'Enter an amount'],
  ])('should reject the amount with its message when it is %s', (amount, message) => {
    const result = parseCreate({ amount });

    expect(failedPaths(result)).toEqual(['amount']);
    expect(messagesOf(result)).toEqual([message]);
  });

  it('should read "Choose a currency" when the currency is unknown', () => {
    expect(messagesOf(parseCreate({ currency: 'JPY' }))).toEqual(['Choose a currency']);
  });

  it.each([
    ['clientId', 'Choose a client'],
    ['stageId', 'Choose a stage'],
    ['assigneeId', 'Choose a member'],
  ])('should reject the deal when %s is missing', (field, message) => {
    const result = parseCreate({ [field]: undefined });

    expect(failedPaths(result)).toEqual([field]);
    expect(messagesOf(result)).toEqual([message]);
  });

  it('should drop unknown keys when the body carries them', () => {
    const result = createDealRequestSchema.parse({
      ...VALID_DEAL,
      workspaceId: CLIENT_ID,
      createdById: MEMBER_ID,
      position: 'a0',
      closedAt: '2026-10-09T09:30:00.000Z',
    });

    expect(result).toEqual(VALID_DEAL);
  });
});

describe('updateDealRequestSchema', () => {
  it('should accept the body when it carries only the version', () => {
    expect(updateDealRequestSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('should reject the body when the version is missing', () => {
    expect(failedPaths(updateDealRequestSchema.safeParse({ title: 'New' }))).toEqual(['version']);
  });

  it('should strip the stage when the body carries stageId', () => {
    expect(updateDealRequestSchema.parse({ version: 2, stageId: STAGE_ID })).toEqual({
      version: 2,
    });
  });
});

describe('moveDealRequestSchema', () => {
  it('should accept the move when afterId is null', () => {
    expect(
      moveDealRequestSchema.safeParse({ version: 1, stageId: STAGE_ID, afterId: null }).success,
    ).toBe(true);
  });

  it('should reject the move when afterId is missing', () => {
    const result = moveDealRequestSchema.safeParse({ version: 1, stageId: STAGE_ID });

    expect(failedPaths(result)).toEqual(['afterId']);
  });

  it('should reject the move when the version is missing', () => {
    const result = moveDealRequestSchema.safeParse({ stageId: STAGE_ID, afterId: null });

    expect(failedPaths(result)).toEqual(['version']);
  });
});

describe('boardQuerySchema', () => {
  it.each([{}, { assignee: 'me' }, { assignee: MEMBER_ID }])(
    'should accept the query when it is %j',
    (query) => {
      expect(boardQuerySchema.safeParse(query).success).toBe(true);
    },
  );

  it('should reject the assignee when it is neither me nor an id', () => {
    expect(failedPaths(boardQuerySchema.safeParse({ assignee: 'someone' }))).toEqual(['assignee']);
  });
});
