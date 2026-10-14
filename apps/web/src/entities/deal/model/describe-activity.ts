import { formatMoney } from '@/shared/lib/money';
import type { DealActivity, DealChange } from '@clientry/shared/deals';

function describeChange(actor: string, change: DealChange): string {
  switch (change.field) {
    case 'title':
      return `${actor} renamed the deal from “${change.from}” to “${change.to}”`;
    case 'amount':
      return `${actor} changed the amount from ${formatMoney(change.from.amount, change.from.currency)} to ${formatMoney(change.to.amount, change.to.currency)}`;
    case 'client':
      return `${actor} changed the client from ${change.from.name} to ${change.to.name}`;
    case 'assignee':
      return `${actor} changed the assignee from ${change.from.name} to ${change.to.name}`;
  }
}

// One sentence per line; an edit gets a line for each field it changed.
export function describeActivity(activity: DealActivity): readonly string[] {
  const actor = activity.actor.name;
  switch (activity.type) {
    case 'deal_created': {
      const { stage, amount, currency } = activity.payload;
      return [`${actor} created the deal in ${stage.name} · ${formatMoney(amount, currency)}`];
    }
    case 'deal_moved': {
      const { from, to, reason } = activity.payload;
      const cause = reason === 'stage_deleted' ? ` when ${from.name} was deleted` : '';
      return [`${actor} moved the deal from ${from.name} to ${to.name}${cause}`];
    }
    case 'deal_updated':
      return activity.payload.changes.map((change) => describeChange(actor, change));
    case 'deal_deleted':
      return [`${actor} deleted the deal`];
    case 'deal_restored':
      return [`${actor} restored the deal`];
  }
}
