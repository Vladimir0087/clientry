import { hashKey, useQueryClient } from '@tanstack/react-query';
import type { QueryCacheNotifyEvent, QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { toast } from 'sonner';

import {
  describeNotification,
  notificationKeys,
  notificationListOptions,
} from '@/entities/notification';
import { unreadCountResponseSchema } from '@clientry/shared/notifications';
import type { Notification, UnreadCountResponse } from '@clientry/shared/notifications';

const NEW_REMINDER_TOAST = 'new-reminder';
const NEW_REMINDER_DURATION_MS = 10_000;
const UNREAD_COUNT_HASH = hashKey(notificationKeys.unreadCount);

interface NewReminderActions {
  readonly onOpen: (notification: Notification) => void;
  readonly onShow: () => void;
}

// A count the server returned; the in-place change after a read is not one, so the server's
// answer that follows it never reads as a new reminder.
function fetchedCount(event: QueryCacheNotifyEvent): number | undefined {
  if (event.type !== 'updated' || event.query.queryHash !== UNREAD_COUNT_HASH) {
    return undefined;
  }
  const { action } = event;
  if (action.type !== 'success' || action.manual === true) {
    return undefined;
  }
  return unreadCountResponseSchema.safeParse(action.data).data?.count;
}

interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

function showReminderToast(text: string, action: ToastAction): void {
  toast(text, { id: NEW_REMINDER_TOAST, duration: NEW_REMINDER_DURATION_MS, action });
}

// The list is fetched first, also while the popover is closed.
async function announce(
  queryClient: QueryClient,
  added: number,
  actions: RefObject<NewReminderActions>,
): Promise<void> {
  // A failed list fetch falls back to the toast with the count only.
  const list = await queryClient
    .infiniteQuery({ ...notificationListOptions, staleTime: 0 })
    .catch(() => undefined);
  const newest = list?.pages[0]?.items.find((notification) => notification.readAt === null);
  if (added === 1 && newest !== undefined) {
    showReminderToast(describeNotification(newest).title, {
      label: 'Open',
      onClick: () => {
        actions.current.onOpen(newest);
      },
    });
    return;
  }
  showReminderToast(`${String(added)} new ${added === 1 ? 'reminder' : 'reminders'}`, {
    label: 'Show',
    onClick: () => {
      actions.current.onShow();
    },
  });
}

// One toast when the server's count rises above the one it last gave this page; never for the
// first count after a load.
export function useNewReminderToast(actions: NewReminderActions): void {
  const queryClient = useQueryClient();
  // A toast's button runs long after its effect; it calls the newest handlers.
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  useEffect(() => {
    let lastCount = queryClient.getQueryData<UnreadCountResponse>(
      notificationKeys.unreadCount,
    )?.count;
    return queryClient.getQueryCache().subscribe((event) => {
      const count = fetchedCount(event);
      if (count === undefined) {
        return;
      }
      const added = lastCount === undefined ? 0 : count - lastCount;
      lastCount = count;
      if (added > 0) {
        void announce(queryClient, added, actionsRef);
      }
    });
  }, [queryClient]);
}
