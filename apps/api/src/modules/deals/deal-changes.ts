import type { Deal, DealChange, UpdateDealRequest } from '@clientry/shared/deals';

export type DealEdit = Omit<UpdateDealRequest, 'version'>;

function changed<T>(sent: T | undefined, stored: T): T | undefined {
  return sent === stored ? undefined : sent;
}

export function changedFields(deal: Deal, edit: DealEdit): DealEdit {
  return {
    title: changed(edit.title, deal.title),
    clientId: changed(edit.clientId, deal.client.id),
    amount: changed(edit.amount, deal.amount),
    currency: changed(edit.currency, deal.currency),
    assigneeId: changed(edit.assigneeId, deal.assignee.id),
  };
}

export function hasChanges(edit: DealEdit): boolean {
  return Object.values<unknown>(edit).some((value) => value !== undefined);
}

// Names come from both versions of the deal, so the entry is a snapshot of that moment.
export function historyChanges(before: Deal, after: Deal): DealChange[] {
  const changes: DealChange[] = [];
  if (before.title !== after.title) {
    changes.push({ field: 'title', from: before.title, to: after.title });
  }
  if (before.amount !== after.amount || before.currency !== after.currency) {
    changes.push({
      field: 'amount',
      from: { amount: before.amount, currency: before.currency },
      to: { amount: after.amount, currency: after.currency },
    });
  }
  if (before.client.id !== after.client.id) {
    changes.push({ field: 'client', from: before.client, to: after.client });
  }
  if (before.assignee.id !== after.assignee.id) {
    changes.push({ field: 'assignee', from: before.assignee, to: after.assignee });
  }
  return changes;
}
