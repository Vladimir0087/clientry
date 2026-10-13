import { describe, expect, it } from 'vitest';

import { loadTaskFilters } from './task-filter-parsers';

describe('loadTaskFilters', () => {
  it('should show my open tasks when the URL has no filters', async () => {
    const filters = await loadTaskFilters({});

    expect(filters).toEqual({ assignee: 'me', status: 'open' });
  });

  it('should filter by anyone when the URL has assignee=anyone', async () => {
    const filters = await loadTaskFilters({ assignee: 'anyone' });

    expect(filters).toEqual({ assignee: null, status: 'open' });
  });

  it('should show done tasks when the URL has status=done', async () => {
    const filters = await loadTaskFilters({ status: 'done' });

    expect(filters).toEqual({ assignee: 'me', status: 'done' });
  });

  it.each([{ assignee: 'me' }, { status: 'open' }, { status: 'bogus' }])(
    'should fall back to the defaults when the URL has %o',
    async (searchParams) => {
      const filters = await loadTaskFilters(searchParams);

      expect(filters).toEqual({ assignee: 'me', status: 'open' });
    },
  );

  it('should keep the member id when the URL has one', async () => {
    const id = '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f';

    expect(await loadTaskFilters({ assignee: id })).toEqual({ assignee: id, status: 'open' });
  });

  it('should fall back to me when the assignee is not me, anyone or an id', async () => {
    expect(await loadTaskFilters({ assignee: 'abc' })).toEqual({ assignee: 'me', status: 'open' });
  });
});
