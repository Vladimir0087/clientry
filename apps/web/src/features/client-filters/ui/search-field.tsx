import { SearchIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shared/ui/input-group';
import { CLIENT_LIMITS } from '@clientry/shared/clients';

export const SEARCH_DELAY_MS = 300;

interface SearchFieldProps {
  readonly value: string;
  readonly onSearch: (q: string) => void;
  readonly inputRef?: React.Ref<HTMLInputElement>;
}

// The input keeps its own text and writes the search after a pause, so one pause sends one request.
export function SearchField({ value, onSearch, inputRef }: SearchFieldProps): React.JSX.Element {
  const id = useId();
  const [text, setText] = useState(value);
  const [writtenValue, setWrittenValue] = useState(value);
  const timerRef = useRef<number | undefined>(undefined);

  // A search changed from outside (Back, "Clear filters") replaces what the input shows.
  if (value !== writtenValue) {
    setWrittenValue(value);
    setText(value);
  }

  // A pending write is dropped when the search changes from outside, so it cannot bring back
  // what "Clear filters" just removed.
  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
    },
    [writtenValue],
  );

  const write = (next: string): void => {
    window.clearTimeout(timerRef.current);
    const trimmed = next.trim();
    setWrittenValue(trimmed);
    onSearch(trimmed);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value;
    setText(next);
    if (next === '') {
      write(next);
      return;
    }
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      write(next);
    }, SEARCH_DELAY_MS);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      write(text);
    }
  };

  return (
    <div className="w-full sm:max-w-sm">
      <label htmlFor={id} className="sr-only">
        Search clients
      </label>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        {/* Typed text stays 16px on phones against iOS zoom; at 16px the placeholder overflows. */}
        <InputGroupInput
          ref={inputRef}
          id={id}
          type="search"
          className="text-ellipsis placeholder:text-sm"
          autoComplete="off"
          maxLength={CLIENT_LIMITS.search}
          placeholder="Search by name, company, email or phone"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </InputGroup>
    </div>
  );
}
