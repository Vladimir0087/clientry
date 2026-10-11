'use client';

import { ChevronsUpDownIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type * as React from 'react';

import { useClientSearch } from '@/entities/client';
import { useDebouncedValue } from '@/shared/lib/use-debounced-value';
import { Button } from '@/shared/ui/button';
import { Command, CommandInput, CommandItem, CommandList } from '@/shared/ui/command';
import type { FieldControlProps } from '@/shared/ui/form-field';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Spinner } from '@/shared/ui/spinner';
import { CLIENT_LIMITS } from '@clientry/shared/clients';
import type { ClientSummary } from '@clientry/shared/clients';

const CLIENT_SEARCH_DELAY_MS = 300;

export interface PickedClient {
  readonly id: string;
  readonly name: string;
}

interface ClientPickerProps extends FieldControlProps {
  readonly value: PickedClient | null;
  readonly onChange: (client: PickedClient) => void;
  readonly onBlur: () => void;
  readonly ref: React.Ref<HTMLButtonElement>;
}

function LoadingClients(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
      <Spinner isDecorative />
      Loading clients…
    </div>
  );
}

interface ClientOptionProps {
  readonly client: ClientSummary;
  readonly isChecked: boolean;
  readonly isDisabled: boolean;
  readonly onSelect: (client: PickedClient) => void;
}

function ClientOption({
  client,
  isChecked,
  isDisabled,
  onSelect,
}: ClientOptionProps): React.JSX.Element {
  return (
    <CommandItem
      value={client.id}
      disabled={isDisabled}
      data-checked={isChecked}
      onSelect={() => {
        onSelect({ id: client.id, name: client.name });
      }}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate">
          {client.name}
          {isChecked && <span className="sr-only"> (current client)</span>}
        </span>
        {client.company !== null && (
          <span className="truncate text-xs text-muted-foreground">{client.company}</span>
        )}
      </span>
    </CommandItem>
  );
}

interface FoundClients {
  readonly items: readonly ClientSummary[];
  // Results of an older term stay in view but cannot be chosen, by Enter included.
  readonly isCurrent: boolean;
  readonly hasResults: boolean;
  readonly isFailed: boolean;
  readonly retry: () => void;
}

function useFoundClients(search: string): FoundClients {
  const term = useDebouncedValue(search.trim(), CLIENT_SEARCH_DELAY_MS);
  const results = useClientSearch(term);
  return {
    items: results.data?.items ?? [],
    isCurrent: term === search.trim() && !results.isPlaceholderData,
    hasResults: results.data !== undefined,
    isFailed: results.data === undefined && results.isError,
    retry: () => {
      void results.refetch();
    },
  };
}

interface SearchStatusProps {
  readonly found: FoundClients;
  readonly onRetry: () => void;
}

// Outside Command, whose key handler takes every Enter, "Try again" included. Always rendered, so
// a screen reader hears what appears in it.
function SearchStatus({ found, onRetry }: SearchStatusProps): React.JSX.Element {
  let content: React.JSX.Element | null = null;
  if (found.isFailed) {
    content = (
      <RetryMessage
        message="Could not load clients."
        focusTargetId={null}
        onRetry={onRetry}
        isCompact
      />
    );
  } else if (!found.hasResults || !found.isCurrent) {
    content = <LoadingClients />;
  } else if (found.items.length === 0) {
    content = <p className="py-6 text-center text-sm">No clients found</p>;
  }
  // Spaced from the list only while it holds something: empty, it takes no room.
  return (
    <div role="status" className="not-empty:pt-2.5">
      {content}
    </div>
  );
}

interface ClientListProps {
  readonly found: FoundClients;
  readonly selectedId: string | undefined;
  readonly onSelect: (client: PickedClient) => void;
}

function ClientList({ found, selectedId, onSelect }: ClientListProps): React.JSX.Element {
  return (
    <CommandList label="Clients">
      {found.items.map((client) => (
        <ClientOption
          // Mounted again once current: cmdk selects the first option only as options mount.
          key={`${client.id}:${String(found.isCurrent)}`}
          client={client}
          isChecked={client.id === selectedId}
          isDisabled={!found.isCurrent}
          onSelect={onSelect}
        />
      ))}
    </CommandList>
  );
}

interface SearchPanelProps extends Omit<ClientListProps, 'found'> {
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
}

// Mounted only while the popover is open, so every opening starts a fresh search.
function SearchPanel({ search, onSearchChange, ...list }: SearchPanelProps): React.JSX.Element {
  const found = useFoundClients(search);
  const inputRef = useRef<HTMLInputElement>(null);
  // The loading row replaces Try again, so focus moves on before the button unmounts.
  const handleRetry = (): void => {
    inputRef.current?.focus();
    found.retry();
  };
  return (
    <>
      <Command label="Search clients" shouldFilter={false}>
        <CommandInput
          ref={inputRef}
          placeholder="Search clients"
          maxLength={CLIENT_LIMITS.search}
          value={search}
          onValueChange={onSearchChange}
        />
        <ClientList found={found} {...list} />
      </Command>
      <SearchStatus found={found} onRetry={handleRetry} />
    </>
  );
}

interface PickerTriggerProps extends FieldControlProps {
  readonly value: PickedClient | null;
  readonly isOpen: boolean;
  readonly contentId: string;
  readonly ref: React.Ref<HTMLButtonElement>;
}

function PickerTrigger({
  value,
  isOpen,
  contentId,
  ref,
  ...control
}: PickerTriggerProps): React.JSX.Element {
  return (
    <PopoverTrigger asChild>
      <Button
        ref={ref}
        {...control}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? contentId : undefined}
        className="w-full justify-between font-normal sm:w-80"
      >
        <span className={value === null ? 'truncate text-muted-foreground' : 'truncate'}>
          {value?.name ?? 'Choose a client'}
        </span>
        <ChevronsUpDownIcon aria-hidden="true" className="opacity-50" />
      </Button>
    </PopoverTrigger>
  );
}

// A combobox over the server's search: Command filters nothing itself.
export function ClientPicker({
  value,
  onChange,
  onBlur,
  ...trigger
}: ClientPickerProps): React.JSX.Element {
  const contentId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const handleOpenChange = (isNextOpen: boolean): void => {
    setIsOpen(isNextOpen);
    if (!isNextOpen) {
      setSearch('');
      onBlur();
    }
  };
  const handleSelect = (client: PickedClient): void => {
    onChange(client);
    handleOpenChange(false);
  };
  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PickerTrigger value={value} isOpen={isOpen} contentId={contentId} {...trigger} />
      <PopoverContent
        id={contentId}
        aria-label="Choose a client"
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 gap-0 p-0"
      >
        <SearchPanel
          search={search}
          onSearchChange={setSearch}
          selectedId={value?.id}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
