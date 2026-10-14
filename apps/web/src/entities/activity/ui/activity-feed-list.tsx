'use client';

import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRef } from 'react';
import type * as React from 'react';
import { toast } from 'sonner';

import { useLoadMoreFocus } from '@/shared/lib/use-load-more-focus';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { LocalDate } from '@/shared/ui/local-date';
import { Spinner } from '@/shared/ui/spinner';
import type { ActivityEntry, ActivitySubject } from '@clientry/shared/activity';

import { describeEntry } from '../model/describe-entry';
import type { EntryPart } from '../model/describe-entry';
import type { ActivityFeedData } from '../model/use-activity-feed';

const ENTRY_ATTRIBUTE = 'data-activity-entry';

const LINK_CLASS =
  'rounded-sm font-medium break-words underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

// Built by the app: entities do not import each other.
export type SubjectHref = (subject: ActivitySubject) => Route;

interface PartProps {
  readonly part: EntryPart;
  readonly subject: ActivitySubject;
  readonly subjectHref: SubjectHref;
}

function Part({ part, subject, subjectHref }: PartProps): React.ReactNode {
  switch (part.kind) {
    case 'text':
      return part.text;
    case 'subject':
      return subject.isAvailable ? (
        <Link href={subjectHref(subject)} className={LINK_CLASS}>
          {subject.label}
        </Link>
      ) : (
        <span className="font-medium">{subject.label}</span>
      );
    case 'due':
      return <LocalDate value={part.at} hasTime />;
    case 'outcome':
      return part.outcome === 'won' ? (
        <Badge variant="success" className="ml-2 align-middle">
          Won
        </Badge>
      ) : (
        <Badge variant="danger" className="ml-2 align-middle">
          Lost
        </Badge>
      );
  }
}

interface EntryProps {
  readonly entry: ActivityEntry;
  readonly index: number;
  readonly subjectHref: SubjectHref;
}

// Focusable from script only, so "Show older" can hand focus to the first new entry.
function Entry({ entry, index, subjectHref }: EntryProps): React.JSX.Element {
  return (
    <li
      {...{ [ENTRY_ATTRIBUTE]: index }}
      tabIndex={-1}
      className="flex flex-col gap-0.5 rounded-sm text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {describeEntry(entry).map((line, lineIndex) => (
        <p key={lineIndex} className="break-words">
          {line.map((part, partIndex) => (
            <Part key={partIndex} part={part} subject={entry.subject} subjectHref={subjectHref} />
          ))}
        </p>
      ))}
      <span className="text-xs text-muted-foreground">
        <LocalDate value={entry.createdAt} hasTime />
      </span>
    </li>
  );
}

interface ShowOlderProps {
  readonly feed: UseInfiniteQueryResult<ActivityFeedData>;
  readonly onPress: () => void;
}

function ShowOlder({ feed, onPress }: ShowOlderProps): React.JSX.Element | null {
  if (!feed.hasNextPage) {
    return null;
  }
  // aria-disabled rather than disabled: a disabled button would drop the focus it holds.
  const handleClick = (): void => {
    if (feed.isFetchingNextPage) {
      return;
    }
    onPress();
    void feed.fetchNextPage().then((result) => {
      if (result.isFetchNextPageError) {
        toast.error('Could not load older activity.');
      }
    });
  };
  return (
    <Button
      variant="outline"
      className="self-start"
      aria-disabled={feed.isFetchingNextPage}
      onClick={handleClick}
    >
      {feed.isFetchingNextPage && <Spinner data-icon="inline-start" aria-hidden="true" />}
      Show older
    </Button>
  );
}

interface ActivityFeedListProps {
  readonly feed: UseInfiniteQueryResult<ActivityFeedData>;
  readonly data: ActivityFeedData;
  readonly subjectHref: SubjectHref;
}

export function ActivityFeedList({
  feed,
  data,
  subjectHref,
}: ActivityFeedListProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const entries = data.pages.flatMap((page) => page.items);
  const handleShowOlder = useLoadMoreFocus(
    containerRef,
    ENTRY_ATTRIBUTE,
    entries.length,
    feed.hasNextPage,
  );
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity yet. New deals, clients and tasks show up here.
      </p>
    );
  }
  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <Entry key={entry.id} entry={entry} index={index} subjectHref={subjectHref} />
        ))}
      </ol>
      <ShowOlder feed={feed} onPress={handleShowOlder} />
    </div>
  );
}
