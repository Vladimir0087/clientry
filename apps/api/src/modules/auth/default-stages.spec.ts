import { describe, expect, it } from 'vitest';

import { DEFAULT_STAGES } from './default-stages.js';

describe('DEFAULT_STAGES', () => {
  it('should list six stages when a workspace is created', () => {
    expect(DEFAULT_STAGES.map(({ name }) => name)).toEqual([
      'New',
      'Call',
      'Proposal sent',
      'Contract',
      'Paid',
      'Lost',
    ]);
  });

  it('should number positions contiguously from zero when stages are listed', () => {
    expect(DEFAULT_STAGES.map(({ position }) => position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('should have exactly one won and one lost stage when kinds are counted', () => {
    const kinds = DEFAULT_STAGES.map(({ kind }) => kind);

    expect(kinds.filter((kind) => kind === 'won')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'lost')).toHaveLength(1);
  });
});
