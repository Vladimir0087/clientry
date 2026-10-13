import { describe, expect, it } from 'vitest';

import { clientListPath } from './client-list-path';
import { DEFAULT_CLIENT_FILTERS, normalizeClientFilters } from '../model/client-filters';
import { clientKeys } from '../model/client-keys';

describe('clientListPath', () => {
  it('should send every filter in API form when all of them are set', () => {
    const filters = normalizeClientFilters({
      q: ' a ',
      sources: ['website', 'telegram'],
      tags: ['vip'],
      createdBy: 'me',
      sort: 'name_asc',
    });

    expect(clientListPath(filters, null)).toBe(
      '/api/clients?q=a&source=telegram&source=website&tag=vip&createdBy=me&sort=name_asc&limit=25',
    );
  });

  it('should leave the defaults out and keep the limit when no filter is set', () => {
    expect(clientListPath(DEFAULT_CLIENT_FILTERS, null)).toBe('/api/clients?limit=25');
  });

  it('should add the cursor when a next page is asked for', () => {
    expect(clientListPath(DEFAULT_CLIENT_FILTERS, 'abc')).toBe('/api/clients?cursor=abc&limit=25');
  });

  it('should build one key and one URL when the same filters come in another order', () => {
    const first = normalizeClientFilters({
      ...DEFAULT_CLIENT_FILTERS,
      sources: ['telegram', 'website'],
      tags: ['warm', 'vip'],
    });
    const second = normalizeClientFilters({
      ...DEFAULT_CLIENT_FILTERS,
      sources: ['website', 'telegram', 'website'],
      tags: ['vip', 'warm'],
    });

    expect(clientKeys.list(first)).toEqual(clientKeys.list(second));
    expect(clientListPath(first, null)).toBe(clientListPath(second, null));
  });
});
