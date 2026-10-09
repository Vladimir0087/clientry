import Link from 'next/link';
import type * as React from 'react';

import { Badge } from '@/shared/ui/badge';

import { CLIENTS_PATH } from '../model/client-path';

interface ClientTagListProps {
  readonly tags: readonly string[];
  // Tags past this count fold into "+N".
  readonly max?: number;
  readonly isLinked?: boolean;
}

export function ClientTagList({
  tags,
  max = tags.length,
  isLinked = false,
}: ClientTagListProps): React.JSX.Element | null {
  if (tags.length === 0) {
    return null;
  }
  const shown = tags.slice(0, max);
  const hidden = tags.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <li key={tag}>
          {isLinked ? (
            <Badge variant="secondary" asChild>
              <Link href={{ pathname: CLIENTS_PATH, query: { tags: tag } }}>{tag}</Link>
            </Badge>
          ) : (
            <Badge variant="secondary">{tag}</Badge>
          )}
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <Badge variant="outline">
            <span aria-hidden="true">+{hidden}</span>
            <span className="sr-only">{`${String(hidden)} more tags`}</span>
          </Badge>
        </li>
      )}
    </ul>
  );
}
