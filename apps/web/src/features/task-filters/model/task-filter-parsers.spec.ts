import { describe, expect, it } from 'vitest';

import { loadTaskFilters } from './task-filter-parsers';

describe('loadTaskFilters', () => {
  it('should show my open tasks when the URL has no filters', async () => {
    const filters = await loadTaskFilters({});

    expect(filters).toEqual({ isMine: true, status: 'open' });
  });

  it('should turn Only mine off when the URL has assignee=anyone', async () => {
    const filters = await loadTaskFilters({ assignee: 'anyone' });

    expect(filters).toEqual({ isMine: false, status: 'open' });
  });

  it('should show done tasks when the URL has status=done', async () => {
    const filters = await loadTaskFilters({ status: 'done' });

    expect(filters).toEqual({ isMine: true, status: 'done' });
  });

  it.each([{ assignee: 'me' }, { status: 'open' }, { status: 'bogus' }])(
    'should fall back to the defaults when the URL has %o',
    async (searchParams) => {
      const filters = await loadTaskFilters(searchParams);

      expect(filters).toEqual({ isMine: true, status: 'open' });
    },
  );
});
