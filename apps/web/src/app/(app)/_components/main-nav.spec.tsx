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

  it.each(['/deals', '/deals/0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b'])(
    'should mark only Deals as the current page when the path is %s',
    (path) => {
      mockPathname.current = path;

      render(<MainNav />);

      expect(screen.getByRole('link', { name: 'Deals' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Clients' })).not.toHaveAttribute('aria-current');
    },
  );

  it('should not mark Clients when the path is the home page', () => {
    render(<MainNav />);

    expect(screen.getByRole('link', { name: 'Clients' })).not.toHaveAttribute('aria-current');
  });

  it.each(['/tasks', '/tasks/0199c2a1-1a2b-7c3d-8e4f-000000000001'])(
    'should mark only Tasks as the current page when the path is %s',
    (path) => {
      mockPathname.current = path;

      render(<MainNav />);

      expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Deals' })).not.toHaveAttribute('aria-current');
    },
  );
});
