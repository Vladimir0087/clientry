import type { FieldError } from '@clientry/shared/common';

const REFERENCE_FIELDS = ['clientId', 'stageId', 'assigneeId'] as const;

type ReferenceField = (typeof REFERENCE_FIELDS)[number];

// One message whether the id is unknown, deleted or in another workspace.
const REFERENCE_MESSAGES: Readonly<Record<ReferenceField, string>> = {
  clientId: 'Choose a client',
  stageId: 'Choose a stage',
  assigneeId: 'Choose a member',
};

// null marks a reference that was looked up and not found; undefined one that was not checked.
export function referenceErrors(found: Partial<Record<ReferenceField, unknown>>): FieldError[] {
  return REFERENCE_FIELDS.filter((field) => found[field] === null).map((field) => ({
    path: field,
    message: REFERENCE_MESSAGES[field],
  }));
}
