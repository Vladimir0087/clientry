import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { completeTask, reopenTask, taskKeys, updateCachedTask } from '@/entities/task';
import { isNotFound } from '@/shared/api/api-status';
import { hasQueryData } from '@/shared/api/has-query-data';
import type { Task } from '@clientry/shared/tasks';

// One toast however many queued toggles fail together.
const TOGGLE_ERROR_TOAST = 'toggle-task-error';

export interface ToggleTaskVariables {
  readonly isDone: boolean;
  // As the screen showed it; the first toggle of a run sees the state the server confirmed.
  readonly previousDoneAt: string | null;
}

// Per client and task, while toggles of the task are in flight: the doneAt the server last
// confirmed. A failure returns to it, never to a state an earlier failed toggle only showed.
const confirmedDoneAts = new WeakMap<QueryClient, Map<string, string | null>>();

function confirmedDoneAtsOf(queryClient: QueryClient): Map<string, string | null> {
  const existing = confirmedDoneAts.get(queryClient);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Map<string, string | null>();
  confirmedDoneAts.set(queryClient, created);
  return created;
}

function toggleKey(id: string): readonly string[] {
  return ['tasks', 'toggle', id];
}

// Counts the settling toggle too: it stays pending while its callbacks run.
function hasLaterToggle(queryClient: QueryClient, id: string): boolean {
  return queryClient.isMutating({ mutationKey: toggleKey(id) }) > 1;
}

function setDoneAt(queryClient: QueryClient, id: string, doneAt: string | null): void {
  updateCachedTask(queryClient, id, (task) => ({ ...task, doneAt }));
}

// The cache changes before the first await; the write survives the cancel.
async function showToggle(
  queryClient: QueryClient,
  id: string,
  { isDone, previousDoneAt }: ToggleTaskVariables,
): Promise<undefined> {
  const confirmed = confirmedDoneAtsOf(queryClient);
  if (!confirmed.has(id)) {
    confirmed.set(id, previousDoneAt);
  }
  setDoneAt(queryClient, id, isDone ? new Date().toISOString() : null);
  await Promise.all([
    queryClient.cancelQueries({ queryKey: taskKeys.lists, predicate: hasQueryData }),
    queryClient.cancelQueries({ queryKey: taskKeys.detail(id), predicate: hasQueryData }),
  ]);
  return undefined;
}

function confirmToggle(queryClient: QueryClient, id: string, task: Task): void {
  confirmedDoneAtsOf(queryClient).set(id, task.doneAt);
  if (!hasLaterToggle(queryClient, id)) {
    updateCachedTask(queryClient, id, () => task);
  }
  void queryClient.invalidateQueries({ queryKey: taskKeys.lists, refetchType: 'none' });
}

function revertToggle(queryClient: QueryClient, id: string, error: Error): void {
  if (isNotFound(error)) {
    toast.error('This task no longer exists.', { id: TOGGLE_ERROR_TOAST });
    void queryClient.invalidateQueries({ queryKey: taskKeys.lists });
    void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
    return;
  }
  if (!hasLaterToggle(queryClient, id)) {
    setDoneAt(queryClient, id, confirmedDoneAtsOf(queryClient).get(id) ?? null);
  }
  // The rollback reads as fresh, yet the request may have reached the server.
  void queryClient.invalidateQueries({ queryKey: taskKeys.lists, refetchType: 'none' });
  void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id), refetchType: 'none' });
  toast.error('Could not update the task. Try again.', { id: TOGGLE_ERROR_TOAST });
}

function settleToggle(queryClient: QueryClient, id: string): void {
  if (!hasLaterToggle(queryClient, id)) {
    confirmedDoneAtsOf(queryClient).delete(id);
  }
}

// One scope per task, so a quick double toggle runs in order. Rows change in place and stay where
// they are until their list is fetched again.
export function useToggleTask(
  id: string,
): UseMutationResult<Task, Error, ToggleTaskVariables, undefined> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: toggleKey(id),
    scope: { id: `toggle-task-${id}` },
    mutationFn: ({ isDone }: ToggleTaskVariables) => (isDone ? completeTask(id) : reopenTask(id)),
    onMutate: (variables) => showToggle(queryClient, id, variables),
    onSuccess: (task) => {
      confirmToggle(queryClient, id, task);
    },
    onError: (error) => {
      revertToggle(queryClient, id, error);
    },
    onSettled: () => {
      settleToggle(queryClient, id);
    },
  });
}
