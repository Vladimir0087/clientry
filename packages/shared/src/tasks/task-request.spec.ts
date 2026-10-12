import { describe, expect, it } from 'vitest';

import {
  createTaskRequestSchema,
  taskListQuerySchema,
  updateTaskRequestSchema,
} from './task-request.js';

const MEMBER_ID = '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
const CLIENT_ID = '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b';
const DEAL_ID = '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b';

const VALID_TASK = {
  title: 'Call Romashka about the proposal',
  dueAt: '2026-10-15T12:00:00.000Z',
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
): ReturnType<typeof createTaskRequestSchema.safeParse> {
  return createTaskRequestSchema.safeParse({ ...VALID_TASK, ...fields });
}

describe('createTaskRequestSchema', () => {
  it('should trim the title when it has surrounding spaces', () => {
    expect(createTaskRequestSchema.parse({ ...VALID_TASK, title: '  Call  ' }).title).toBe('Call');
  });

  it('should read "Enter a title" when the title is blank', () => {
    expect(messagesOf(parseCreate({ title: '   ' }))).toEqual(['Enter a title']);
  });

  it('should read "Use at most 200 characters" when the title has 201 characters', () => {
    expect(messagesOf(parseCreate({ title: 't'.repeat(201) }))).toEqual([
      'Use at most 200 characters',
    ]);
  });

  it('should read "Choose a due date" when dueAt is missing', () => {
    const result = parseCreate({ dueAt: undefined });

    expect(failedPaths(result)).toEqual(['dueAt']);
    expect(messagesOf(result)).toEqual(['Choose a due date']);
  });

  it.each(['1999-12-31T23:59:59.999Z', '2100-01-01T00:00:00.000Z'])(
    'should read "Choose a date between 2000 and 2099" when dueAt is %s',
    (dueAt) => {
      expect(messagesOf(parseCreate({ dueAt }))).toEqual(['Choose a date between 2000 and 2099']);
    },
  );

  it.each(['2000-01-01T00:00:00.000Z', '2099-12-31T23:59:59.999Z'])(
    'should accept dueAt when it is the boundary %s',
    (dueAt) => {
      expect(parseCreate({ dueAt }).success).toBe(true);
    },
  );

  it('should read only "Choose a due date" when dueAt is not a date', () => {
    expect(messagesOf(parseCreate({ dueAt: 'abc' }))).toEqual(['Choose a due date']);
  });

  it('should reject dueAt when it has an offset other than Z', () => {
    expect(failedPaths(parseCreate({ dueAt: '2026-10-15T15:00:00+03:00' }))).toEqual(['dueAt']);
  });

  it('should read only "Choose a due date" when dueAt has an offset and lies outside the range', () => {
    expect(messagesOf(parseCreate({ dueAt: '1999-12-31T23:59:59+03:00' }))).toEqual([
      'Choose a due date',
    ]);
  });

  it('should reject dueAt when the calendar date does not exist', () => {
    expect(failedPaths(parseCreate({ dueAt: '2026-02-31T12:00:00Z' }))).toEqual(['dueAt']);
  });

  it('should add milliseconds to dueAt when it has none', () => {
    const task = createTaskRequestSchema.parse({ ...VALID_TASK, dueAt: '2026-10-15T12:00:00Z' });

    expect(task.dueAt).toBe('2026-10-15T12:00:00.000Z');
  });

  it('should normalize remindAt when it is set', () => {
    const task = createTaskRequestSchema.parse({ ...VALID_TASK, remindAt: '2026-10-15T06:00:00Z' });

    expect(task.remindAt).toBe('2026-10-15T06:00:00.000Z');
  });

  it('should accept remindAt when it is null', () => {
    expect(parseCreate({ remindAt: null }).success).toBe(true);
  });

  it.each([[{ kind: 'client', id: CLIENT_ID }], [{ kind: 'deal', id: DEAL_ID }], [null]])(
    'should accept related when it is %j',
    (related) => {
      expect(createTaskRequestSchema.parse({ ...VALID_TASK, related }).related).toEqual(related);
    },
  );

  it('should reject related when its kind is unknown', () => {
    expect(parseCreate({ related: { kind: 'stage', id: CLIENT_ID } }).success).toBe(false);
  });

  it.each([
    ['client', 'Choose a client'],
    ['deal', 'Choose a deal'],
  ])('should read its message on related.id when a %s id is not a UUID', (kind, message) => {
    const result = parseCreate({ related: { kind, id: 'nope' } });

    expect(failedPaths(result)).toEqual(['related.id']);
    expect(messagesOf(result)).toEqual([message]);
  });

  it('should read "Choose a member" when assigneeId is missing', () => {
    expect(messagesOf(parseCreate({ assigneeId: undefined }))).toEqual(['Choose a member']);
  });

  it('should drop unknown keys when the body carries them', () => {
    const result = createTaskRequestSchema.parse({
      ...VALID_TASK,
      workspaceId: CLIENT_ID,
      createdById: MEMBER_ID,
      doneAt: '2026-10-15T12:00:00.000Z',
      reminderSentAt: '2026-10-15T12:00:00.000Z',
      deletedAt: '2026-10-15T12:00:00.000Z',
    });

    expect(result).toEqual(VALID_TASK);
  });
});

describe('updateTaskRequestSchema', () => {
  it('should accept the body when it is empty', () => {
    expect(updateTaskRequestSchema.parse({})).toEqual({});
  });

  it('should accept remindAt and related when they are null', () => {
    expect(updateTaskRequestSchema.parse({ remindAt: null, related: null })).toEqual({
      remindAt: null,
      related: null,
    });
  });
});

describe('taskListQuerySchema', () => {
  it('should default to open tasks, 25 a page, when no parameter is given', () => {
    expect(taskListQuerySchema.parse({})).toEqual({ status: 'open', limit: 25 });
  });

  it('should read "Use clientId or dealId, not both" when both are given', () => {
    const result = taskListQuerySchema.safeParse({ clientId: CLIENT_ID, dealId: DEAL_ID });

    expect(messagesOf(result)).toEqual(['Use clientId or dealId, not both']);
  });

  it('should reject the assignee when it is not me', () => {
    expect(failedPaths(taskListQuerySchema.safeParse({ assignee: 'someone' }))).toEqual([
      'assignee',
    ]);
  });

  it('should reject the limit when it is 101', () => {
    expect(failedPaths(taskListQuerySchema.safeParse({ limit: '101' }))).toEqual(['limit']);
  });
});
