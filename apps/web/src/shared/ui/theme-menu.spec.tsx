import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ThemeMenu } from './theme-menu';
import { renderWithProviders } from '../../../test/render';

describe('ThemeMenu', () => {
  it('should put the dark class on html when Dark is chosen', async () => {
    renderWithProviders(<ThemeMenu />);

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
  });
});
