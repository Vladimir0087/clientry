import Link from 'next/link';
import type * as React from 'react';

import { LocalDate } from '@/shared/ui/local-date';
import type { DealCard } from '@clientry/shared/deals';

import { dealPath } from '../model/deal-path';
import { formatMoney } from '../model/money';

interface DealCardBodyProps {
  readonly deal: DealCard;
  // The drag overlay is a picture of the card, not a second link.
  readonly isStatic?: boolean;
}

export function DealCardBody({ deal, isStatic = false }: DealCardBodyProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 py-2 text-sm">
      {isStatic ? (
        <span className="font-medium break-words">{deal.title}</span>
      ) : (
        <Link
          href={dealPath(deal.id)}
          className="w-fit max-w-full rounded-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {deal.title}
        </Link>
      )}
      <span className="break-words text-muted-foreground">
        <span className="sr-only">Client </span>
        {deal.client.name}
      </span>
      <span className="font-medium tabular-nums">{formatMoney(deal.amount, deal.currency)}</span>
      <span className="break-words text-muted-foreground">
        <span className="sr-only">Assigned to </span>
        {deal.assignee.name}
      </span>
      {deal.closedAt !== null && (
        <span className="text-xs text-muted-foreground">
          Closed <LocalDate value={deal.closedAt} />
        </span>
      )}
    </div>
  );
}
