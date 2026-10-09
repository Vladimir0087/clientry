import { renderHook } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it } from 'vitest';

import { loadClientFilters } from './client-filter-parsers';
import { useClientFilters } from './use-client-filters';

describe('useClientFilters', () => {
  it('should read the same filters as the server loader when the URL has filters', async () => {
    const search = { q: ' acme ', source: 'website,telegram', tags: 'VIP,warm', mine: 'true' };

    const { result } = renderHook(() => useClientFilters(), {
      wrapper: withNuqsTestingAdapter({ searchParams: search }),
    });

    expect(result.current.filters).toEqual(await loadClientFilters(search));
  });
});
