import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DealCardBody } from './deal-card-body';
import { TEST_DEAL } from '../../../../test/deals';

describe('DealCardBody', () => {
  it('should label the client and the assignee for screen readers when the card shows them', () => {
    render(<DealCardBody deal={TEST_DEAL} />);

    expect(screen.getByText(TEST_DEAL.client.name)).toHaveTextContent(
      `Client ${TEST_DEAL.client.name}`,
    );
    expect(screen.getByText(TEST_DEAL.assignee.name)).toHaveTextContent(
      `Assigned to ${TEST_DEAL.assignee.name}`,
    );
    expect(screen.getByText('Client')).toHaveClass('sr-only');
    expect(screen.getByText('Assigned to')).toHaveClass('sr-only');
  });
});
