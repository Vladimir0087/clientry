import type { UseQueryResult } from '@tanstack/react-query';
import { ArrowUpDownIcon, ChevronDownIcon } from 'lucide-react';
import type * as React from 'react';

import { CLIENT_SOURCES, sourceLabel, useClientTags } from '@/entities/client';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { clientSortSchema } from '@clientry/shared/clients';
import type { ClientSort, ClientSource, ClientTagsResponse } from '@clientry/shared/clients';

const SORT_LABELS: Readonly<Record<ClientSort, string>> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name_asc: 'Name A–Z',
  name_desc: 'Name Z–A',
};

function toggled<T>(values: readonly T[], value: T, isChecked: boolean): T[] {
  return isChecked ? [...values, value] : values.filter((item) => item !== value);
}

// Keeps the menu open, so several values can be picked in a row.
function keepOpen(event: Event): void {
  event.preventDefault();
}

interface MenuTriggerProps {
  readonly label: string;
  readonly count: number;
}

function MenuTrigger({ label, count }: MenuTriggerProps): React.JSX.Element {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="outline">
        {label}
        {count > 0 && (
          <Badge variant="secondary">
            <span aria-hidden="true">{count}</span>
            <span className="sr-only">{`, ${String(count)} selected`}</span>
          </Badge>
        )}
        <ChevronDownIcon aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
  );
}

interface SourceMenuProps {
  readonly selected: readonly ClientSource[];
  readonly onChange: (sources: readonly ClientSource[]) => void;
}

export function SourceMenu({ selected, onChange }: SourceMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <MenuTrigger label="Source" count={selected.length} />
      <DropdownMenuContent align="start">
        {CLIENT_SOURCES.map((source) => (
          <DropdownMenuCheckboxItem
            key={source}
            checked={selected.includes(source)}
            onSelect={keepOpen}
            onCheckedChange={(isChecked) => {
              onChange(toggled(selected, source, isChecked));
            }}
          >
            {sourceLabel(source)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TagsMenuProps {
  readonly selected: readonly string[];
  readonly onChange: (tags: readonly string[]) => void;
}

interface TagOption {
  readonly tag: string;
  readonly count: number | null;
}

// A tag picked in the URL stays listed even when no client carries it any more.
function tagOptions(counts: readonly TagOption[], selected: readonly string[]): TagOption[] {
  const known = new Set(counts.map(({ tag }) => tag));
  const orphans = selected.filter((tag) => !known.has(tag)).map((tag) => ({ tag, count: null }));
  return [...counts, ...orphans];
}

function tagsNotice(tags: UseQueryResult<ClientTagsResponse>, hasOptions: boolean): string | null {
  if (tags.data === undefined) {
    return tags.isError ? 'Could not load tags' : 'Loading tags…';
  }
  return hasOptions ? null : 'No tags yet';
}

export function TagsMenu({ selected, onChange }: TagsMenuProps): React.JSX.Element {
  const tags = useClientTags();
  const options = tagOptions(tags.data?.items ?? [], selected);
  const notice = tagsNotice(tags, options.length > 0);
  return (
    <DropdownMenu>
      <MenuTrigger label="Tags" count={selected.length} />
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {notice !== null && <DropdownMenuLabel>{notice}</DropdownMenuLabel>}
        {options.map(({ tag, count }) => (
          <DropdownMenuCheckboxItem
            key={tag}
            checked={selected.includes(tag)}
            onSelect={keepOpen}
            onCheckedChange={(isChecked) => {
              onChange(toggled(selected, tag, isChecked));
            }}
          >
            <span className="truncate">{tag}</span>
            {count !== null && (
              <span className="ml-auto pl-3 text-xs text-muted-foreground">{count}</span>
            )}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortMenuProps {
  readonly value: ClientSort;
  readonly onChange: (sort: ClientSort) => void;
}

function isSort(value: string): value is ClientSort {
  return clientSortSchema.safeParse(value).success;
}

export function SortMenu({ value, onChange }: SortMenuProps): React.JSX.Element {
  const handleChange = (next: string): void => {
    if (isSort(next)) {
      onChange(next);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={`Sort: ${SORT_LABELS[value]}`}>
          <ArrowUpDownIcon aria-hidden="true" />
          {SORT_LABELS[value]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={handleChange}>
          {clientSortSchema.options.map((sort) => (
            <DropdownMenuRadioItem key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
