'use client';

import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { cn } from 'cn';
import Link from 'next/link';
import { useRef } from 'react';
import type * as React from 'react';

import { describeNotification } from '@/entities/notification';
import type { NotificationListData } from '@/entities/notification';
import { taskPath } from '@/entities/task';
import { useLoadMoreFocus } from '@/shared/lib/use-load-more-focus';
import { Button } from '@/shared/ui/button';
import { LocalDate } from '@/shared/ui/local-date';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Skeleton } from '@/shared/ui/skeleton';
import { Spinner } from '@/shared/ui/spinner';
import type { Notification } from '@clientry/shared/notifications';

import type { FollowNotification } from '../model/use-follow-notification';

type NotificationListQuery = UseInfiniteQueryResult<NotificationListData>;

const ENTRY_LINK_ATTRIBUTE = 'data-notification-index';
const SKELETON_ROWS = 3;
const MIDDLE_BUTTON = 1;

function isModifiedClick(event: React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function EntryText({ notification }: { readonly notification: Notification }): React.JSX.Element {
  const { title, dueAt } = describeNotification(notification);
  const isUnread = notification.readAt === null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', isUnread && 'bg-primary')}
      />
      {/* The spaces keep the parts apart in the link's name; the column ignores them. */}
      <span className="flex min-w-0 flex-col gap-0.5">
        {isUnread && <span className="sr-only">Unread</span>}{' '}
        <span className={cn('break-words', isUnread && 'font-semibold')}>{title}</span>{' '}
        <span className="text-xs text-muted-foreground">
          Due <LocalDate value={dueAt} hasTime />
        </span>{' '}
        <span className="text-xs text-muted-foreground">
          <span className="sr-only">Received </span>
          <LocalDate value={notification.createdAt} hasTime />
        </span>
      </span>
    </>
  );
}

interface EntryProps {
  readonly notification: Notification;
  readonly index: number;
  readonly onFollow: FollowNotification;
}

function Entry({ notification, index, onFollow }: EntryProps): React.JSX.Element {
  const { taskId } = describeNotification(notification);
  // Next navigates on a plain click; a modified one opens a new tab and leaves the popover.
  const handleClick = (event: React.MouseEvent): void => {
    onFollow(notification, !isModifiedClick(event));
  };
  // Browsers fire auxclick, not click, for the middle button, which opens a new tab.
  const handleAuxClick = (event: React.MouseEvent): void => {
    if (event.button === MIDDLE_BUTTON) {
      onFollow(notification, false);
    }
  };
  return (
    <li>
      <Link
        href={taskPath(taskId)}
        {...{ [ENTRY_LINK_ATTRIBUTE]: index }}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        className="flex gap-2 px-3 py-2 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <EntryText notification={notification} />
      </Link>
    </li>
  );
}

interface ShowOlderProps {
  readonly list: NotificationListQuery;
  readonly onPress: () => void;
}

function ShowOlder({ list, onPress }: ShowOlderProps): React.JSX.Element | null {
  if (!list.hasNextPage) {
    return null;
  }
  // aria-disabled rather than disabled: a disabled button would drop the focus it holds.
  const handleClick = (): void => {
    if (!list.isFetchingNextPage) {
      onPress();
      void list.fetchNextPage();
    }
  };
  return (
    <div className="flex flex-col items-center gap-1 border-t p-2">
      {list.isFetchNextPageError && (
        <p className="text-xs text-destructive">Could not load older notifications</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-disabled={list.isFetchingNextPage}
        onClick={handleClick}
      >
        {list.isFetchingNextPage && <Spinner data-icon="inline-start" aria-hidden="true" />}
        {list.isFetchNextPageError ? 'Try again' : 'Show older'}
      </Button>
    </div>
  );
}

interface EntriesProps {
  readonly list: NotificationListQuery;
  readonly items: readonly Notification[];
  readonly onFollow: FollowNotification;
  readonly listRef: React.RefObject<HTMLUListElement | null>;
}

function Entries({ list, items, onFollow, listRef }: EntriesProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleShowOlder = useLoadMoreFocus(
    containerRef,
    ENTRY_LINK_ATTRIBUTE,
    items.length,
    list.hasNextPage,
  );
  return (
    <div ref={containerRef}>
      <ul ref={listRef} className="max-h-96 overflow-y-auto py-1">
        {items.map((notification, index) => (
          <Entry
            key={notification.id}
            notification={notification}
            index={index}
            onFollow={onFollow}
          />
        ))}
      </ul>
      <ShowOlder list={list} onPress={handleShowOlder} />
    </div>
  );
}

interface NotificationListProps extends Omit<EntriesProps, 'items'> {
  readonly headingId: string;
}

export function NotificationList({
  list,
  headingId,
  ...entries
}: NotificationListProps): React.JSX.Element {
  if (list.data === undefined) {
    if (list.isError) {
      const handleRetry = (): void => {
        void list.refetch();
      };
      return (
        <RetryMessage
          message="We could not load notifications."
          focusTargetId={headingId}
          onRetry={handleRetry}
          isCompact
        />
      );
    }
    return (
      <div data-testid="notification-skeleton" className="flex flex-col gap-2 p-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  const items = list.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        No notifications yet. Reminders for your tasks appear here.
      </p>
    );
  }
  return <Entries list={list} items={items} {...entries} />;
}
