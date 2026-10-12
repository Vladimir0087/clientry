import type { FieldError } from '@clientry/shared/common';
import type { TaskRelatedRequest } from '@clientry/shared/tasks';

const RELATED_MESSAGES: Readonly<Record<TaskRelatedRequest['kind'], string>> = {
  client: 'Choose a client',
  deal: 'Choose a deal',
};

export interface ReferenceLookups {
  readonly assignee?: unknown;
  readonly related?: { readonly kind: TaskRelatedRequest['kind']; readonly found: unknown };
}

// null marks a reference that was looked up and not found; undefined one that was not checked.
// One message whether the id is unknown, deleted, hidden or in another workspace.
export function referenceErrors({ assignee, related }: ReferenceLookups): FieldError[] {
  const errors: FieldError[] = [];
  if (assignee === null) {
    errors.push({ path: 'assigneeId', message: 'Choose a member' });
  }
  if (related?.found === null) {
    errors.push({ path: 'related.id', message: RELATED_MESSAGES[related.kind] });
  }
  return errors;
}
