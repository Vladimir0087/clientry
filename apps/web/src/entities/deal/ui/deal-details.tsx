import { useId } from 'react';
import type * as React from 'react';

import { formatMoney } from '@/shared/lib/money';
import { LocalDate } from '@/shared/ui/local-date';
import type { Deal } from '@clientry/shared/deals';

interface DetailProps {
  readonly label: string;
  readonly labelId?: string;
  readonly children: React.ReactNode;
}

function Detail({ label, labelId, children }: DetailProps): React.JSX.Element {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-4">
      <dt id={labelId} className="text-sm text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

interface DealDetailsProps {
  readonly deal: Deal;
  // The feature that owns the move supplies the control, named by the Stage label.
  readonly stageControl: (labelId: string) => React.ReactNode;
}

export function DealDetails({ deal, stageControl }: DealDetailsProps): React.JSX.Element {
  const stageLabelId = useId();
  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col gap-3">
        <Detail label="Amount">
          <span className="tabular-nums">{formatMoney(deal.amount, deal.currency)}</span>
        </Detail>
        <Detail label="Stage" labelId={stageLabelId}>
          {stageControl(stageLabelId)}
        </Detail>
        <Detail label="Assignee">{deal.assignee.name}</Detail>
      </dl>
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        {deal.closedAt !== null && (
          <p>
            Closed on <LocalDate value={deal.closedAt} />
          </p>
        )}
        <p>
          Added by {deal.createdBy.name} on <LocalDate value={deal.createdAt} /> · Updated{' '}
          <LocalDate value={deal.updatedAt} />
        </p>
      </div>
    </div>
  );
}
