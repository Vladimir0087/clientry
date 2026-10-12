import { describe, expect, it } from 'vitest';

import type { Deal } from '@clientry/shared/deals';

import { changedFields, hasChanges, historyChanges } from './deal-changes.js';

const ANN = { id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', name: 'Ann' };
const MAX = { id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', name: 'Max' };
const ROMASHKA = { id: '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b', name: 'Romashka LLC' };
const LUTIK = { id: '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0c', name: 'Lutik' };

const DEAL: Deal = {
  id: '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b',
  title: 'Landing page',
  amount: 150_000,
  currency: 'USD',
  stage: { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c', name: 'Call', kind: 'open' },
  client: ROMASHKA,
  assignee: ANN,
  createdBy: ANN,
  closedAt: null,
  version: 1,
  createdAt: '2026-10-09T09:30:00.000Z',
  updatedAt: '2026-10-09T09:30:00.000Z',
};

describe('deal changes', () => {
  it('should drop the fields equal to the stored ones when the edit repeats them', () => {
    const edit = changedFields(DEAL, {
      title: DEAL.title,
      clientId: ROMASHKA.id,
      amount: DEAL.amount,
      currency: 'USD',
      assigneeId: ANN.id,
    });

    expect(hasChanges(edit)).toBe(false);
  });

  it('should keep only the differing fields when some fields change', () => {
    const edit = changedFields(DEAL, { title: 'Shop', amount: DEAL.amount, assigneeId: MAX.id });

    expect(edit).toEqual({
      title: 'Shop',
      clientId: undefined,
      amount: undefined,
      currency: undefined,
      assigneeId: MAX.id,
    });
  });

  it('should list title, amount, client and assignee with names when they all change', () => {
    const after: Deal = {
      ...DEAL,
      title: 'Shop',
      amount: 99_00,
      client: LUTIK,
      assignee: MAX,
    };

    expect(historyChanges(DEAL, after)).toEqual([
      { field: 'title', from: 'Landing page', to: 'Shop' },
      {
        field: 'amount',
        from: { amount: 150_000, currency: 'USD' },
        to: { amount: 99_00, currency: 'USD' },
      },
      { field: 'client', from: ROMASHKA, to: LUTIK },
      { field: 'assignee', from: ANN, to: MAX },
    ]);
  });

  it('should give one amount item with the amount when only the currency changes', () => {
    expect(historyChanges(DEAL, { ...DEAL, currency: 'EUR' })).toEqual([
      {
        field: 'amount',
        from: { amount: 150_000, currency: 'USD' },
        to: { amount: 150_000, currency: 'EUR' },
      },
    ]);
  });

  it('should give no items when nothing changed', () => {
    expect(historyChanges(DEAL, { ...DEAL, version: 2 })).toEqual([]);
  });
});
