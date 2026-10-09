'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import type * as React from 'react';

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
  const handleMineToggle = (): void => {
    state.setMine(!filters.isMine);
  };
  return (
    <div role="search" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchField value={filters.q} onSearch={state.setSearch} inputRef={searchRef} />
      <div className="flex flex-wrap items-center gap-2">
        <SourceMenu selected={filters.sources} onChange={state.setSources} />
        <TagsMenu selected={filters.tags} onChange={state.setTags} />
        <Button
          variant={filters.isMine ? 'secondary' : 'outline'}
          aria-pressed={filters.isMine}
          onClick={handleMineToggle}
        >
          {filters.isMine && <CheckIcon aria-hidden="true" />}
          Only mine
        </Button>
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
