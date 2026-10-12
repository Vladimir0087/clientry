import { describe, expect, it } from 'vitest';

import { changedFields, hasChanges } from './task-changes.js';
import { DEAL_REF, MANAGER, TASK } from '../../../test/support/task-doubles.js';

describe('task changes', () => {
  it('should drop every field when each sent value is the stored one', () => {
    const edit = changedFields(TASK, {
      title: TASK.title,
      dueAt: TASK.dueAt,
      remindAt: TASK.remindAt,
      assigneeId: TASK.assignee.id,
      related: { kind: 'client', id: TASK.related?.id ?? '' },
    });

    expect(hasChanges(edit)).toBe(false);
  });

  it('should keep only the fields that differ when some change', () => {
    const edit = changedFields(TASK, {
      title: 'New',
      dueAt: TASK.dueAt,
      assigneeId: MANAGER.id,
    });

    expect(edit).toEqual({
      title: 'New',
      dueAt: undefined,
      remindAt: undefined,
      assigneeId: MANAGER.id,
      related: undefined,
    });
  });

  it('should keep related when the same id comes with another kind', () => {
    const related = { kind: 'deal', id: TASK.related?.id ?? '' } as const;

    expect(changedFields(TASK, { related }).related).toEqual(related);
  });

  it('should keep related when it links another deal', () => {
    const related = { kind: 'deal', id: DEAL_REF.id } as const;

    expect(changedFields(TASK, { related }).related).toEqual(related);
  });

  it.each([
    ['related', { related: null }],
    ['remindAt', { remindAt: null }],
  ])('should keep %s when null removes a stored value', (field, edit) => {
    expect(changedFields(TASK, edit)).toMatchObject(edit);
  });

  it('should drop related when null is sent for a task without a link', () => {
    expect(changedFields({ ...TASK, related: null }, { related: null }).related).toBeUndefined();
  });

  it('should report no changes when the edit is empty', () => {
    expect(hasChanges(changedFields(TASK, {}))).toBe(false);
  });
});
