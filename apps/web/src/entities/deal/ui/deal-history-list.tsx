import type * as React from 'react';

import { LocalDate } from '@/shared/ui/local-date';
import type { DealHistoryResponse } from '@clientry/shared/deals';

import { describeActivity } from '../model/describe-activity';

interface DealHistoryListProps {
  readonly history: DealHistoryResponse;
}

export function DealHistoryList({ history }: DealHistoryListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {history.items.map((activity) => (
          <li key={activity.id} className="flex flex-col gap-0.5 text-sm">
            {describeActivity(activity).map((line) => (
              <p key={line} className="break-words">
                {line}
              </p>
            ))}
            <span className="text-xs text-muted-foreground">
              <LocalDate value={activity.createdAt} hasTime />
            </span>
          </li>
        ))}
      </ol>
      {history.hasMore && (
        <p className="text-sm text-muted-foreground">Older changes are not shown.</p>
      )}
    </div>
  );
}
