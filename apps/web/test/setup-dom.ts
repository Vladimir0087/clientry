import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { installBrowserApis } from './browser-apis';
import { mockRouter } from './mocks/router';

// The router and full page navigations are the only mocked modules: jsdom cannot navigate.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => mockRouter,
}));
vi.mock('@/shared/lib/navigation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  replaceLocation: vi.fn(),
}));

installBrowserApis();

afterEach(() => {
  // Focus left inside a removed menu makes jsdom blur the window later, which closes Radix menus.
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.className = '';
});
