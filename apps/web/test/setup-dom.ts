import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, vi } from 'vitest';

import { installBrowserApis } from './browser-apis';
import { mockPathname, mockRouter } from './mocks/router';

// The router and full page navigations are the only mocked modules: jsdom cannot navigate.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => mockRouter,
  usePathname: () => mockPathname.current,
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
  // Sonner keeps toasts in a module-level store that outlives the Toaster of a test.
  toast.dismiss();
  vi.clearAllMocks();
  mockPathname.current = '/';
  window.localStorage.clear();
  document.documentElement.className = '';
});
