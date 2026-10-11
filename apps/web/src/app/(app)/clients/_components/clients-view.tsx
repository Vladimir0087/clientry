'use client';

import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { cn } from 'cn';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type * as React from 'react';

import {
  ClientList,
  ClientListSkeleton,
  NEW_CLIENT_PATH,
  ROW_LINK_ATTRIBUTE,
  useClientList,
} from '@/entities/client';
import type { ClientListData } from '@/entities/client';
import { ClientFiltersToolbar, useClientFilters } from '@/features/client-filters';
import type { ClientFiltersState } from '@/features/client-filters';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Spinner } from '@/shared/ui/spinner';

type ClientListQuery = UseInfiniteQueryResult<ClientListData>;

const HEADING_ID = 'clients-heading';

// Both layouts hold a link per row and CSS hides one; focus lands on the one that can take it.
function focusRow(container: HTMLElement | null, index: number): void {
  const links = container?.querySelectorAll<HTMLElement>(
    `[${ROW_LINK_ATTRIBUTE}="${String(index)}"]`,
  );
  for (const link of links ?? []) {
    link.focus();
    if (document.activeElement === link) {
      return;
    }
  }
}

function NewClientButton(): React.JSX.Element {
  return (
    <Button asChild>
      <Link href={NEW_CLIENT_PATH}>
        <PlusIcon aria-hidden="true" />
        New client
      </Link>
    </Button>
  );
}

interface EmptyStateProps {
  readonly state: ClientFiltersState;
  readonly onClear: () => void;
}

function EmptyState({ state, onClear }: EmptyStateProps): React.JSX.Element {
  if (state.hasActiveFilters) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No clients match your filters</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No clients yet</EmptyTitle>
        <EmptyDescription>Add the people and companies you work with.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <NewClientButton />
      </EmptyContent>
    </Empty>
  );
}

function LoadMore({ list }: { readonly list: ClientListQuery }): React.JSX.Element | null {
  if (!list.hasNextPage) {
    return null;
  }
  // aria-disabled rather than disabled: a disabled button would drop the focus it holds.
  const handleClick = (): void => {
    if (!list.isFetchingNextPage) {
      void list.fetchNextPage();
    }
  };
  return (
    <div className="flex flex-col items-center gap-2">
      {list.isFetchNextPageError && <p className="text-sm text-destructive">Could not load more</p>}
      <Button
        variant="outline"
        aria-disabled={list.isFetchingNextPage}
        data-load-more=""
        onClick={handleClick}
      >
        {list.isFetchingNextPage && <Spinner data-icon="inline-start" aria-hidden="true" />}
        {list.isFetchNextPageError ? 'Try again' : 'Load more'}
      </Button>
    </div>
  );
}

interface ClientRowsProps {
  readonly list: ClientListQuery;
  readonly data: ClientListData;
}

function ClientRows({ list, data }: ClientRowsProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = data.pages.flatMap((page) => page.items);
  const pendingFocusRef = useRef<number | null>(null);
  const hasNextPage = list.hasNextPage;

  // Focus stays on "Load more" while pages arrive; once it disappears, the first new row takes it.
  useEffect(() => {
    const index = pendingFocusRef.current;
    if (index === null || items.length <= index) {
      return;
    }
    pendingFocusRef.current = null;
    if (!hasNextPage) {
      focusRow(containerRef.current, index);
    }
  }, [items.length, hasNextPage]);

  const handleLoadMoreCapture = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target instanceof Element && event.target.closest('[data-load-more]') !== null) {
      pendingFocusRef.current = items.length;
    }
  };

  return (
    <div
      ref={containerRef}
      aria-busy={list.isPlaceholderData}
      className={cn(
        'flex flex-col gap-4 transition-opacity',
        list.isPlaceholderData && 'opacity-60',
      )}
      onClickCapture={handleLoadMoreCapture}
    >
      <ClientList items={items} />
      <LoadMore list={list} />
    </div>
  );
}

interface ListBodyProps {
  readonly list: ClientListQuery;
  readonly state: ClientFiltersState;
  readonly onClear: () => void;
}

function ListBody({ list, state, onClear }: ListBodyProps): React.JSX.Element {
  if (list.data === undefined) {
    if (list.isError) {
      const handleRetry = (): void => {
        void list.refetch();
      };
      return (
        <RetryMessage
          message="We could not load clients."
          focusTargetId={HEADING_ID}
          onRetry={handleRetry}
        />
      );
    }
    return <ClientListSkeleton />;
  }
  const hasItems = list.data.pages.some((page) => page.items.length > 0);
  return hasItems ? (
    <ClientRows list={list} data={list.data} />
  ) : (
    <EmptyState state={state} onClear={onClear} />
  );
}

function shownText(list: ClientListQuery): string {
  if (list.data === undefined || list.isPlaceholderData || list.isFetchingNextPage) {
    return '';
  }
  const count = list.data.pages.reduce((total, page) => total + page.items.length, 0);
  return `${String(count)} ${count === 1 ? 'client' : 'clients'} shown`;
}

export function ClientsView(): React.JSX.Element {
  const state = useClientFilters();
  const list = useClientList(state.filters);
  const searchRef = useRef<HTMLInputElement>(null);
  // "Clear filters" disappears once pressed, so focus goes to the search.
  const handleClear = (): void => {
    state.clearFilters();
    searchRef.current?.focus();
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading id={HEADING_ID}>Clients</PageHeading>
        <NewClientButton />
      </div>
      <ClientFiltersToolbar state={state} searchRef={searchRef} onClear={handleClear} />
      <ListBody list={list} state={state} onClear={handleClear} />
      <p role="status" className="sr-only">
        {shownText(list)}
      </p>
    </div>
  );
}
