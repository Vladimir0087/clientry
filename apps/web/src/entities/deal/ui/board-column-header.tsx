import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import type { BoardColumn } from '@clientry/shared/deals';

import { StageKindBadge } from './stage-badge';
import { newDealPath } from '../model/deal-path';
import { columnSummary } from '../model/money';

interface BoardColumnHeaderProps {
  readonly column: BoardColumn;
  readonly headingId: string;
}

export function BoardColumnHeader({
  column,
  headingId,
}: BoardColumnHeaderProps): React.JSX.Element {
  const { stage } = column;
  return (
    <header className="flex flex-col gap-1">
      <div className="flex min-h-7 items-center gap-2">
        <h2 id={headingId} className="min-w-0 truncate font-medium">
          {stage.name}
        </h2>
        <StageKindBadge kind={stage.kind} />
        {stage.kind === 'open' && (
          <Button variant="ghost" size="sm" className="ml-auto" asChild>
            <Link
              href={newDealPath({ stageId: stage.id })}
              aria-label={`Add deal to ${stage.name}`}
            >
              <PlusIcon aria-hidden="true" />
              Add deal
            </Link>
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{columnSummary(column.count, column.totals)}</p>
    </header>
  );
}
