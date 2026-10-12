import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { toDateInput, toInstant, toTimeInput } from '@/shared/lib/local-date-time';
import { createTaskRequestSchema } from '@clientry/shared/tasks';
import type {
  CreateTaskRequest,
  Task,
  TaskRelatedRequest,
  UpdateTaskRequest,
} from '@clientry/shared/tasks';

import { choiceFor, REMINDER_CHOICES, reminderInstant } from './reminder-choice';
import type { ReminderChoice } from './reminder-choice';

export const DEFAULT_TIME = '09:00';

const {
  title: titleSchema,
  dueAt: instantSchema,
  assigneeId: assigneeSchema,
} = createTaskRequestSchema.shape;

function rangeMessage(instant: string): string | undefined {
  return instantSchema.safeParse(instant).error?.issues[0]?.message;
}

interface LocalFields {
  readonly dueDate: string;
  readonly dueTime: string;
  readonly reminder: string;
  readonly remindDate: string;
  readonly remindTime: string;
}

type IssueSink = (path: keyof LocalFields, message: string) => void;

function checkMoment(date: string, time: string, path: keyof LocalFields, report: IssueSink): void {
  if (date === '' || time === '') {
    return;
  }
  const instant = toInstant(date, time);
  const message = instant === null ? 'Choose a valid date' : rangeMessage(instant);
  if (message !== undefined) {
    report(path, message);
  }
}

function checkLocalFields(values: LocalFields, report: IssueSink): void {
  checkMoment(values.dueDate, values.dueTime, 'dueDate', report);
  if (values.reminder !== 'custom') {
    return;
  }
  if (values.remindDate === '') {
    report('remindDate', 'Choose a reminder date');
  }
  if (values.remindTime === '') {
    report('remindTime', 'Choose a reminder time');
  }
  checkMoment(values.remindDate, values.remindTime, 'remindDate', report);
}

// Dates and times as the inputs hold them, in the browser's zone; instants are built on submit.
export const taskFormSchema = z
  .object({
    title: titleSchema,
    dueDate: z.string().min(1, 'Choose a due date'),
    dueTime: z.string().min(1, 'Choose a due time'),
    reminder: z.enum(REMINDER_CHOICES),
    remindDate: z.string(),
    remindTime: z.string(),
    assigneeId: assigneeSchema,
    clientId: z.string(),
    dealId: z.string(),
  })
  // Runs with other fields invalid too, so an empty submit shows every missing field at once.
  .superRefine(
    (values, ctx) => {
      checkLocalFields(values, (path, message) => {
        ctx.addIssue({ code: 'custom', path: [path], message });
      });
    },
    { when: () => true },
  );

export type TaskFormValues = z.input<typeof taskFormSchema>;
export type TaskFormOutput = z.output<typeof taskFormSchema>;
export type TaskFormApi = UseFormReturn<TaskFormValues, unknown, TaskFormOutput>;

export const TASK_FIELDS = [
  'title',
  'dueDate',
  'dueTime',
  'reminder',
  'remindDate',
  'remindTime',
  'assigneeId',
  'clientId',
  'dealId',
] as const satisfies readonly (keyof TaskFormValues)[];

interface TaskFormDefaults {
  readonly assigneeId: string;
  readonly clientId?: string;
  readonly dealId?: string;
}

export function emptyTaskValues({
  assigneeId,
  clientId,
  dealId,
}: TaskFormDefaults): TaskFormValues {
  return {
    title: '',
    dueDate: '',
    dueTime: DEFAULT_TIME,
    reminder: 'at_due',
    remindDate: '',
    remindTime: '',
    assigneeId,
    clientId: clientId ?? '',
    dealId: dealId ?? '',
  };
}

function relatedIds(task: Task): { readonly clientId: string; readonly dealId: string } {
  if (task.related === null) {
    return { clientId: '', dealId: '' };
  }
  return task.related.kind === 'client'
    ? { clientId: task.related.id, dealId: '' }
    : { clientId: task.related.client.id, dealId: task.related.id };
}

export function toTaskFormValues(task: Task): TaskFormValues {
  const reminder = choiceFor(task.dueAt, task.remindAt);
  const customAt = reminder === 'custom' ? task.remindAt : null;
  return {
    title: task.title,
    dueDate: toDateInput(task.dueAt),
    dueTime: toTimeInput(task.dueAt),
    reminder,
    remindDate: customAt === null ? '' : toDateInput(customAt),
    remindTime: customAt === null ? '' : toTimeInput(customAt),
    assigneeId: task.assignee.id,
    ...relatedIds(task),
  };
}

export interface TaskInstants {
  readonly dueAt: string;
  readonly remindAt: string | null;
}

type MomentValues = Pick<
  TaskFormValues,
  'dueDate' | 'dueTime' | 'reminder' | 'remindDate' | 'remindTime'
>;

// Null only for values the schema refuses, so a parsed form always has its instants.
export function toTaskInstants(values: MomentValues): TaskInstants | null {
  const dueAt = toInstant(values.dueDate, values.dueTime);
  if (dueAt === null) {
    return null;
  }
  const customAt = toInstant(values.remindDate, values.remindTime);
  return { dueAt, remindAt: reminderInstant(values.reminder, dueAt, customAt) };
}

// A deal names its client, so it alone is sent when chosen.
function toRelated(values: TaskFormOutput): TaskRelatedRequest | null {
  if (values.dealId !== '') {
    return { kind: 'deal', id: values.dealId };
  }
  return values.clientId === '' ? null : { kind: 'client', id: values.clientId };
}

export function toCreateTaskRequest(
  values: TaskFormOutput,
  instants: TaskInstants,
): CreateTaskRequest {
  return {
    title: values.title,
    dueAt: instants.dueAt,
    remindAt: instants.remindAt,
    assigneeId: values.assigneeId,
    related: toRelated(values),
  };
}

function isSameRelated(task: Task, related: TaskRelatedRequest | null): boolean {
  return task.related?.kind === related?.kind && task.related?.id === related?.id;
}

// What the untouched form builds for a task. A stored time the inputs cannot show, with seconds
// or in the second pass of a repeated hour, then reads as unchanged instead of moved.
export function shownInstants(task: Task): TaskInstants {
  return toTaskInstants(toTaskFormValues(task)) ?? { dueAt: task.dueAt, remindAt: task.remindAt };
}

// Only what differs from the task the form opened with is sent.
export function changedTaskFields(
  values: TaskFormOutput,
  instants: TaskInstants,
  task: Task,
): UpdateTaskRequest {
  const request = toCreateTaskRequest(values, instants);
  const related = request.related ?? null;
  const shown = shownInstants(task);
  return {
    ...(request.title === task.title ? {} : { title: request.title }),
    ...(request.dueAt === shown.dueAt ? {} : { dueAt: request.dueAt }),
    ...(request.remindAt === shown.remindAt ? {} : { remindAt: request.remindAt }),
    ...(request.assigneeId === task.assignee.id ? {} : { assigneeId: request.assigneeId }),
    ...(isSameRelated(task, related) ? {} : { related }),
  };
}

const CUSTOM_TIME_FIELDS: readonly (keyof TaskFormValues)[] = ['remindDate', 'remindTime'];

// The custom reminder fields count only while Custom time is chosen: a shortcut chosen again
// leaves them filled, and nothing of theirs is sent.
export function hasSendableChanges(
  dirtyFields: Partial<Readonly<Record<keyof TaskFormValues, boolean>>>,
  reminder: ReminderChoice,
): boolean {
  return TASK_FIELDS.some(
    (name) =>
      dirtyFields[name] === true && (reminder === 'custom' || !CUSTOM_TIME_FIELDS.includes(name)),
  );
}
