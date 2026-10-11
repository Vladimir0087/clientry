import { describe, expect, it } from 'vitest';

import {
  createStageRequestSchema,
  deleteStageQuerySchema,
  reorderStagesRequestSchema,
} from './stage.js';

const NUL = String.fromCharCode(0);

function stageId(index: number): string {
  return `0199a3c4-6f70-7a81-9b2c-${index.toString(16).padStart(12, '0')}`;
}

interface Issues {
  readonly error?: { readonly issues: readonly { path: PropertyKey[]; message: string }[] };
}

function messagesOf(result: Issues): string[] {
  return (result.error?.issues ?? []).map(({ message }) => message);
}

describe('createStageRequestSchema', () => {
  it('should trim the name when it has surrounding spaces', () => {
    expect(createStageRequestSchema.parse({ name: '  Call  ' }).name).toBe('Call');
  });

  it('should read "Enter a stage name" when the name is blank', () => {
    expect(messagesOf(createStageRequestSchema.safeParse({ name: '  ' }))).toEqual([
      'Enter a stage name',
    ]);
  });

  it('should read "Use at most 50 characters" when the name has 51 characters', () => {
    expect(messagesOf(createStageRequestSchema.safeParse({ name: 's'.repeat(51) }))).toEqual([
      'Use at most 50 characters',
    ]);
  });

  it('should reject the name when it contains a NUL character', () => {
    expect(createStageRequestSchema.safeParse({ name: `Ca${NUL}ll` }).success).toBe(false);
  });
});

describe('reorderStagesRequestSchema', () => {
  it('should read "Stages must be unique" on the repeat when an id appears twice', () => {
    const result = reorderStagesRequestSchema.safeParse({ ids: [stageId(1), stageId(1)] });

    expect(messagesOf(result)).toEqual(['Stages must be unique']);
    expect(result.error?.issues[0]?.path).toEqual(['ids', 1]);
  });

  it('should read "Stages must be unique" when an id repeats in another case', () => {
    const id = stageId(10);

    const result = reorderStagesRequestSchema.safeParse({ ids: [id, id.toUpperCase()] });

    expect(messagesOf(result)).toEqual(['Stages must be unique']);
  });

  it('should reject the list when it is empty', () => {
    expect(reorderStagesRequestSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it('should reject the list when it has 11 ids', () => {
    const ids = Array.from({ length: 11 }, (_, index) => stageId(index));

    expect(reorderStagesRequestSchema.safeParse({ ids }).success).toBe(false);
  });
});

describe('deleteStageQuerySchema', () => {
  it('should read "Choose another open stage" when moveDealsTo is missing', () => {
    expect(messagesOf(deleteStageQuerySchema.safeParse({}))).toEqual(['Choose another open stage']);
  });
});
