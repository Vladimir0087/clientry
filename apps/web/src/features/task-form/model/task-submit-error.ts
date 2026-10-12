import { TASKS_PATH } from '@/entities/task';
import { ApiError } from '@/shared/api/api-error';
import { isNotFound } from '@/shared/api/api-status';
import { applySubmitError } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';

import { TASK_FIELDS } from './task-form-values';
import type { TaskFormApi, TaskFormOutput } from './task-form-values';

const NOT_FOUND_ALERT: FormAlertContent = {
  message: 'This task no longer exists.',
  link: { href: TASKS_PATH, label: 'Back to tasks' },
};

// The field that shows the reminder: its date for a custom time, else the select.
export function reminderField(values: Pick<TaskFormOutput, 'reminder'>): 'remindDate' | 'reminder' {
  return values.reminder === 'custom' ? 'remindDate' : 'reminder';
}

// The API names instants and the link; the form shows them on the inputs they came from.
function formPath(path: string, values: TaskFormOutput): string {
  if (path === 'dueAt') {
    return 'dueDate';
  }
  if (path === 'remindAt') {
    return reminderField(values);
  }
  if (path.startsWith('related')) {
    return values.dealId === '' ? 'clientId' : 'dealId';
  }
  return path;
}

function withFormPaths(error: ApiError, values: TaskFormOutput): ApiError {
  const { status, code, detail, requestId, retryAfterSeconds } = error;
  return new ApiError({
    status,
    code,
    detail,
    requestId,
    retryAfterSeconds,
    errors: error.errors.map(({ path, message }) => ({ path: formPath(path, values), message })),
  });
}

export function taskSubmitAlert(
  error: unknown,
  form: TaskFormApi,
  values: TaskFormOutput,
  isEdit: boolean,
): FormAlertContent | null {
  if (isEdit && isNotFound(error)) {
    return NOT_FOUND_ALERT;
  }
  const mapped = error instanceof ApiError ? withFormPaths(error, values) : error;
  return applySubmitError(mapped, form, TASK_FIELDS);
}
