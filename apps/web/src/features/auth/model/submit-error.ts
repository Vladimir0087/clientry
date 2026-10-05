import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { ApiError } from '@/shared/api/api-error';
import type { FieldError } from '@clientry/shared/common';

const VALIDATION_FAILED = 'VALIDATION_FAILED';
const TOO_MANY_REQUESTS = 429;
const SECONDS_PER_MINUTE = 60;
const GENERIC_MESSAGE = 'Something went wrong. Try again.';

export interface FormAlertContent {
  readonly message: string;
  readonly reference?: string;
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

function unexpectedAlert(error: unknown): FormAlertContent {
  return {
    message: GENERIC_MESSAGE,
    reference: error instanceof ApiError ? error.requestId : undefined,
  };
}

// A path that matches no field still reaches the user through the form alert.
function applyFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  errors: readonly FieldError[],
  fields: readonly Path<T>[],
): FormAlertContent | null {
  const unmatched: string[] = [];
  let hasFocused = false;
  for (const { path, message } of errors) {
    const field = fields.find((name) => name === path);
    if (field === undefined) {
      unmatched.push(message);
    } else {
      form.setError(field, { type: 'server', message }, { shouldFocus: !hasFocused });
      hasFocused = true;
    }
  }
  return unmatched.length === 0 ? null : { message: unmatched.join(' ') };
}

// The outcomes both auth forms share; each form handles its own codes before calling this.
export function applySubmitError<T extends FieldValues>(
  error: unknown,
  form: UseFormReturn<T>,
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
