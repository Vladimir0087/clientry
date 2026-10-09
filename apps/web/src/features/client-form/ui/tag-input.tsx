import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';

import type { FieldControlProps } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { CLIENT_LIMITS } from '@clientry/shared/clients';

import { TagChips } from './tag-chips';

const SEPARATOR = ',';

type FocusTarget = 'input' | 'last-chip';

interface TagInputProps extends FieldControlProps {
  readonly value: readonly string[];
  readonly suggestions: readonly string[];
  readonly onChange: (tags: string[]) => void;
  readonly onBlur: () => void;
  readonly ref: React.RefCallback<HTMLInputElement>;
}

// Lowercased and without repeats, as the API stores them; a pasted "a,b" adds two tags.
function addTags(tags: readonly string[], text: string): string[] {
  const added = text
    .split(SEPARATOR)
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== '');
  return [...new Set([...tags, ...added])].slice(0, CLIENT_LIMITS.tags);
}

interface FocusAfterChange {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly chipsRef: React.RefObject<HTMLUListElement | null>;
  readonly focusAfterChange: (target: FocusTarget) => void;
}

// A removed chip takes its button with it, and the full input is disabled: either way focus
// would fall to the page body, so it moves to the input or to the last chip.
function useFocusAfterChange(value: readonly string[]): FocusAfterChange {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chipsRef = useRef<HTMLUListElement | null>(null);
  const targetRef = useRef<FocusTarget | null>(null);
  useEffect(() => {
    const target = targetRef.current;
    targetRef.current = null;
    if (target === 'input') {
      inputRef.current?.focus();
    } else if (target === 'last-chip') {
      chipsRef.current?.querySelector<HTMLButtonElement>('li:last-child button')?.focus();
    }
  }, [value]);
  const focusAfterChange = (target: FocusTarget): void => {
    targetRef.current = target;
  };
  return { inputRef, chipsRef, focusAfterChange };
}

export function TagInput({
  value,
  suggestions,
  onChange,
  onBlur,
  ref,
  ...control
}: TagInputProps): React.JSX.Element {
  const listId = useId();
  const [text, setText] = useState('');
  const { inputRef, chipsRef, focusAfterChange } = useFocusAfterChange(value);

  const setInputRef = (element: HTMLInputElement | null): void => {
    inputRef.current = element;
    ref(element);
  };

  // Returns whether the list is now full, which disables the input.
  const commit = (added: string, rest: string): boolean => {
    const next = addTags(value, added);
    const isFull = next.length >= CLIENT_LIMITS.tags;
    if (next.length !== value.length) {
      onChange(next);
    }
    setText(isFull ? '' : rest);
    return isFull;
  };

  // Android keyboards send the comma as an "Unidentified" key, so it is also caught in the text.
  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const typed = event.target.value;
    const end = typed.lastIndexOf(SEPARATOR);
    if (end === -1) {
      setText(typed);
      return;
    }
    if (commit(typed.slice(0, end), typed.slice(end + 1).trimStart())) {
      focusAfterChange('last-chip');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === SEPARATOR) {
      event.preventDefault();
      if (commit(text, '')) {
        focusAfterChange('last-chip');
      }
      return;
    }
    if (event.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleBlur = (): void => {
    commit(text, '');
    onBlur();
  };

  const handleRemove = (tag: string): void => {
    focusAfterChange('input');
    onChange(value.filter((item) => item !== tag));
  };

  return (
    <div className="flex flex-col gap-2">
      <TagChips tags={value} listRef={chipsRef} onRemove={handleRemove} />
      <Input
        {...control}
        ref={setInputRef}
        autoComplete="off"
        list={listId}
        disabled={value.length >= CLIENT_LIMITS.tags}
        maxLength={CLIENT_LIMITS.tag}
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <datalist id={listId}>
        {suggestions
          .filter((tag) => !value.includes(tag))
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
    </div>
  );
}
