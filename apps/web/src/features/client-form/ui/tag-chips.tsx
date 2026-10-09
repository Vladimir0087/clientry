import { XIcon } from 'lucide-react';
import type * as React from 'react';

import { Badge } from '@/shared/ui/badge';

interface TagChipsProps {
  readonly tags: readonly string[];
  readonly listRef: React.Ref<HTMLUListElement>;
  readonly onRemove: (tag: string) => void;
}

export function TagChips({ tags, listRef, onRemove }: TagChipsProps): React.JSX.Element | null {
  if (tags.length === 0) {
    return null;
  }
  return (
    <ul ref={listRef} className="flex flex-wrap gap-1" aria-label="Selected tags">
      {tags.map((tag) => (
        <li key={tag}>
          <Badge variant="secondary" className="h-6 overflow-visible pr-0.5">
            {tag}
            {/* The pseudo-element widens the hit area to 28px without changing the chip. */}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              className="relative rounded-full p-0.5 outline-none after:absolute after:-inset-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => {
                onRemove(tag);
              }}
            >
              <XIcon aria-hidden="true" className="size-3" />
            </button>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
