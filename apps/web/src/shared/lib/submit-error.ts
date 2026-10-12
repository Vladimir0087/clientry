import type { Route } from 'next';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { ApiError } from '@/shared/api/api-error';
import { isApiUnreachable } from '@/shared/api/api-status';
import type { FieldError } from '@clientry/shared/common';

const VALIDATION_FAILED = 'VALIDATION_FAILED';
const TOO_MANY_REQUESTS = 429;
const SECONDS_PER_MINUTE = 60;
const GENERIC_MESSAGE = 'Something went wrong. Try again.';
const UNREACHABLE_MESSAGE = 'The server is waking up or busy. Try again in a minute.';

export interface FormAlertContent {
  readonly message: string;
  readonly reference?: string;
  readonly link?: { readonly href: Route; readonly label: string };
  readonly action?: { readonly label: string; readonly onClick: () => void };
}

function pluralize(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}

function rateLimitAlert(retryAfterSeconds: number | undefined): FormAlertContent {
  if (retryAfterSeconds === undefined) {
    return { message: 'Too many attempts. Try again later.' };
  }
  const wait =
    retryAfterSeconds < SECONDS_PER_MINUTE
      ? pluralize(retryAfterSeconds, 'second')
      : pluralize(Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE), 'minute');
  return { message: `Too many attempts. Try again in ${wait}.` };
}

export function unexpectedAlert(error: unknown): FormAlertContent {
  if (isApiUnreachable(error)) {
    return { message: UNREACHABLE_MESSAGE };
  }
  return {
    message: GENERIC_MESSAGE,
    reference: error instanceof ApiError ? error.requestId : undefined,
  };
}

// tags.1 belongs to the tags field: an item's error shows on the control that holds the list.
function findField<T extends FieldValues>(
  fields: readonly Path<T>[],
  path: string,
): Path<T> | undefined {
  return fields.find((name) => path === name || path.startsWith(`${name}.`));
}

// A path that matches no field still reaches the user through the form alert.
function applyFieldErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError'>,
  errors: readonly FieldError[],
  fields: readonly Path<T>[],
): FormAlertContent | null {
  const unmatched: string[] = [];
  let hasFocused = false;
  for (const { path, message } of errors) {
    const field = findField(fields, path);
    if (field === undefined) {
      unmatched.push(message);
    } else {
      form.setError(field, { type: 'server', message }, { shouldFocus: !hasFocused });
      hasFocused = true;
    }
  }
  return unmatched.length === 0 ? null : { message: unmatched.join(' ') };
}

// The outcomes every form shares; each form handles its own codes before calling this.
export function applySubmitError<T extends FieldValues>(
  error: unknown,
  form: Pick<UseFormReturn<T>, 'setError'>,
  fields: readonly Path<T>[],
): FormAlertContent | null {
  if (!(error instanceof ApiError)) {
    return unexpectedAlert(error);
  }
  if (error.code === VALIDATION_FAILED && error.errors.length > 0) {
    return applyFieldErrors(form, error.errors, fields);
  }
  if (error.status === TOO_MANY_REQUESTS) {
    return rateLimitAlert(error.retryAfterSeconds);
  }
  return unexpectedAlert(error);
}
