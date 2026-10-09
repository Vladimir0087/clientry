import { describe, expect, it } from 'vitest';

import { loadClientFilters } from './client-filter-parsers';

describe('loadClientFilters', () => {
  it('should read every filter when the URL sets all of them', async () => {
    const filters = await loadClientFilters({
      q: 'acme',
      source: 'website,telegram',
      tags: 'vip',
      mine: 'true',
      sort: 'name_asc',
    });

    expect(filters).toEqual({
      q: 'acme',
      sources: ['telegram', 'website'],
      tags: ['vip'],
      isMine: true,
      sort: 'name_asc',
    });
  });

  it('should drop an unknown source and an empty tag and lowercase the rest when the URL is hand-edited', async () => {
    const filters = await loadClientFilters({ source: 'fax', tags: 'VIP,' });

    expect(filters.sources).toEqual([]);
    expect(filters.tags).toEqual(['vip']);
  });

  it('should cut the search to 100 characters when it is longer', async () => {
    const filters = await loadClientFilters({ q: 'q'.repeat(101) });

    expect(filters.q).toHaveLength(100);
  });

  it('should keep at most 10 tags and fall back to newest when the sort is unknown', async () => {
    const tags = Array.from({ length: 12 }, (_, index) => `t${String(index)}`).join(',');

    const filters = await loadClientFilters({ tags, sort: 'random' });

    expect(filters.tags).toHaveLength(10);
    expect(filters.sort).toBe('newest');
  });
});
