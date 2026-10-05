import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from './error';

describe('ErrorPage', () => {
  it('should retry the failed segment when Try again is clicked', async () => {
    const retry = vi.fn();
    render(<ErrorPage retry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
