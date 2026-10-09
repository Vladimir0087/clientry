import type { FieldNamesMarkedBoolean } from 'react-hook-form';

import { updateClientRequestSchema } from '@clientry/shared/clients';
import type { Client, CreateClientRequest, UpdateClientRequest } from '@clientry/shared/clients';

export type ClientFormValues = CreateClientRequest;

export const CLIENT_FIELDS = [
  'name',
  'company',
  'email',
  'phone',
  'source',
  'tags',
  'notes',
] as const satisfies readonly (keyof ClientFormValues)[];

export type ClientField = (typeof CLIENT_FIELDS)[number];

export const EMPTY_CLIENT_VALUES: ClientFormValues = {
  name: '',
  company: '',
  email: '',
  phone: '',
  source: null,
  tags: [],
  notes: '',
};

// Inputs show null as empty; the API stores an empty input as null again.
export function toClientFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    company: client.company ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    source: client.source,
    tags: [...client.tags],
    notes: client.notes ?? '',
  };
}

function isDirty(flag: unknown): boolean {
  return Array.isArray(flag) ? flag.some(Boolean) : flag === true;
}

// Only what the user changed is sent, so two people editing different fields do not collide;
// a changed tag list goes whole.
export function changedFields(
  values: ClientFormValues,
  dirtyFields: Partial<Readonly<FieldNamesMarkedBoolean<ClientFormValues>>>,
): UpdateClientRequest {
  const changed = CLIENT_FIELDS.filter((field) => isDirty(dirtyFields[field]));
  return updateClientRequestSchema.parse(
    Object.fromEntries(changed.map((field) => [field, values[field]])),
  );
}
