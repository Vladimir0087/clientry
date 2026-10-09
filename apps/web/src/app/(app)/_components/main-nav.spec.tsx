import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MainNav } from './main-nav';
import { mockPathname } from '../../../../test/mocks/router';

describe('MainNav', () => {
  it.each(['/clients', '/clients/0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b'])(
    'should mark Clients as the current page when the path is %s',
    (path) => {
      mockPathname.current = path;

      render(<MainNav />);

      expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page');
    },
  );

  it('should not mark Clients when the path is the home page', () => {
    render(<MainNav />);

    expect(screen.getByRole('link', { name: 'Clients' })).not.toHaveAttribute('aria-current');
  });
});
