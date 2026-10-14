import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PipelineChart } from './pipeline-chart';
import { makeSummary } from '../../../../test/dashboard';

describe('PipelineChart', () => {
  it('should list every open stage with its count and totals in the hidden table when stages are given', () => {
    render(
      <>
        <h2 id="pipeline">Pipeline</h2>
        <PipelineChart stages={makeSummary().stages} labelledBy="pipeline" />
      </>,
    );

    const rows = within(screen.getByRole('table', { name: 'Open deals by stage' })).getAllByRole(
      'row',
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      'StageDealsAmount',
      'New9 deals$9,000',
      'Call0 deals—',
      'Proposal sent5 deals$36,500 · €1,200',
    ]);
  });

  it('should name the figure by the section heading when it is labelled', () => {
    render(
      <>
        <h2 id="pipeline">Pipeline</h2>
        <PipelineChart stages={makeSummary().stages} labelledBy="pipeline" />
      </>,
    );

    expect(screen.getByRole('figure', { name: 'Pipeline' })).toBeInTheDocument();
  });
});
