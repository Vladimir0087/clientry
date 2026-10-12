'use client';

import { BellIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';

import { useNotifications, useUnreadCount } from '@/entities/notification';
import { focusPageHeading } from '@/shared/lib/heading-focus';
import { useIsUserActive } from '@/shared/lib/use-is-user-active';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

import { NotificationList } from './notification-list';
import {
  useFollowNotification,
  useOpenNotification,
  useTaskShownCheck,
} from '../model/use-follow-notification';
import type { FollowNotification } from '../model/use-follow-notification';
import { useMarkAllRead } from '../model/use-mark-read';
import { useNewReminderToast } from '../model/use-new-reminder-toast';

const MAX_SHOWN_COUNT = 99;

function countText(count: number): string {
  return count > MAX_SHOWN_COUNT ? `${String(MAX_SHOWN_COUNT)}+` : String(count);
}

// Polls while the user is active; input after a pause asks at once instead of waiting a minute,
// unless window focus already did or is doing so.
function usePolledUnreadCount(): number | undefined {
  const isActive = useIsUserActive();
  const unread = useUnreadCount(isActive);
  const isPreviouslyActiveRef = useRef(isActive);
  const { refetch, isStale } = unread;
  useEffect(() => {
    if (isActive && !isPreviouslyActiveRef.current && isStale) {
      void refetch({ cancelRefetch: false });
    }
    isPreviouslyActiveRef.current = isActive;
  }, [isActive, isStale, refetch]);
  return unread.data?.count;
}

interface BellFollow {
  readonly handleFollow: FollowNotification;
  readonly handleCloseAutoFocus: (event: Event) => void;
}

// A new page's heading takes focus as it mounts; a task already in view mounts none.
type CloseFocus = 'bell' | 'new-page' | 'shown-task';

// Radix refocuses the bell after its exit animation; a new page's heading may hold focus by then.
function useBellFollow(close: () => void): BellFollow {
  const follow = useFollowNotification();
  const isTaskShown = useTaskShownCheck();
  const closeFocusRef = useRef<CloseFocus>('bell');
  return {
    handleFollow: (notification, isOpeningHere) => {
      follow(notification, isOpeningHere);
      if (isOpeningHere) {
        closeFocusRef.current = isTaskShown(notification) ? 'shown-task' : 'new-page';
        close();
      }
    },
    handleCloseAutoFocus: (event) => {
      const closeFocus = closeFocusRef.current;
      closeFocusRef.current = 'bell';
      if (closeFocus === 'bell') {
        return;
      }
      event.preventDefault();
      if (closeFocus === 'shown-task') {
        focusPageHeading();
      }
    },
  };
}

interface NotificationPanelProps {
  readonly count: number;
  readonly onFollow: FollowNotification;
}

// Mounted only while the popover is open, so the list loads then.
function NotificationPanel({ count, onFollow }: NotificationPanelProps): React.JSX.Element {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const list = useNotifications();
  const markAll = useMarkAllRead();
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const newest = items[0];
  const hasUnread = count > 0 || items.some((notification) => notification.readAt === null);
  // The button leaves once nothing is unread, so the first entry takes its focus.
  const handleMarkAll = (): void => {
    if (newest === undefined) {
      return;
    }
    listRef.current?.querySelector<HTMLElement>('a')?.focus();
    markAll.mutate(newest.createdAt);
  };
  return (
    <>
      <div className="flex min-h-11 items-center justify-between gap-2 border-b px-3 py-1.5">
        <h2 id={headingId} tabIndex={-1} className="font-medium outline-none">
          Notifications
        </h2>
        {hasUnread && newest !== undefined && (
          <Button variant="ghost" size="sm" onClick={handleMarkAll}>
            Mark all as read
          </Button>
        )}
      </div>
      <NotificationList list={list} headingId={headingId} onFollow={onFollow} listRef={listRef} />
    </>
  );
}

function BellTrigger({ count }: { readonly count: number }): React.JSX.Element {
  const label = count > 0 ? `Notifications, ${countText(count)} unread` : 'Notifications';
  return (
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" aria-label={label} className="relative">
        <BellIcon aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-none font-semibold text-danger-foreground tabular-nums"
          >
            {countText(count)}
          </span>
        )}
      </Button>
    </PopoverTrigger>
  );
}

export function NotificationBell(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const count = usePolledUnreadCount() ?? 0;
  const openNotification = useOpenNotification();
  const { handleFollow, handleCloseAutoFocus } = useBellFollow(() => {
    setIsOpen(false);
  });
  useNewReminderToast({
    onOpen: openNotification,
    onShow: () => {
      setIsOpen(true);
    },
  });
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <BellTrigger count={count} />
      <PopoverContent
        align="end"
        collisionPadding={16}
        aria-label="Notifications"
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <NotificationPanel count={count} onFollow={handleFollow} />
      </PopoverContent>
    </Popover>
  );
}
