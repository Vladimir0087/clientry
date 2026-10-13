'use client';

import { XIcon } from 'lucide-react';
import type * as React from 'react';

import { MemberFilterMenu } from '@/entities/member';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';

import { SourceMenu, SortMenu, TagsMenu } from './filter-menus';
import { SearchField } from './search-field';
import type { ClientFiltersState } from '../model/use-client-filters';

interface ClientFiltersToolbarProps {
  readonly state: ClientFiltersState;
  readonly searchRef: React.Ref<HTMLInputElement>;
  readonly onClear: () => void;
}

export function ClientFiltersToolbar({
  state,
  searchRef,
  onClear,
}: ClientFiltersToolbarProps): React.JSX.Element {
  const { filters } = state;
  const session = useSession();
  return (
    <div role="search" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchField value={filters.q} onSearch={state.setSearch} inputRef={searchRef} />
      <div className="flex flex-wrap items-center gap-2">
        <SourceMenu selected={filters.sources} onChange={state.setSources} />
        <TagsMenu selected={filters.tags} onChange={state.setTags} />
        <MemberFilterMenu
          label="Added by"
          value={filters.createdBy}
          currentUserId={session.data?.user.id}
          onChange={state.setCreatedBy}
        />
        <SortMenu value={filters.sort} onChange={state.setSort} />
        {state.hasActiveFilters && (
          <Button variant="ghost" onClick={onClear}>
            <XIcon aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
