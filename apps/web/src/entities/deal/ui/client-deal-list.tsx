import Link from 'next/link';
import type * as React from 'react';

import type { DealListResponse } from '@clientry/shared/deals';

import { StageBadge } from './stage-badge';
import { dealPath } from '../model/deal-path';
import { formatMoney } from '../model/money';

export function ClientDealList({ deals }: { readonly deals: DealListResponse }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border">
        {deals.items.map((deal) => (
          <li
            key={deal.id}
            className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:gap-4"
          >
            <Link
              href={dealPath(deal.id)}
              className="min-w-0 flex-1 rounded-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {deal.title}
            </Link>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StageBadge stage={deal.stage} />
              <span className="tabular-nums">{formatMoney(deal.amount, deal.currency)}</span>
              <span className="text-muted-foreground">{deal.assignee.name}</span>
            </span>
          </li>
        ))}
      </ul>
      {deals.hasMore && (
        <p className="text-sm text-muted-foreground">Showing the 50 newest deals.</p>
      )}
    </div>
  );
}
