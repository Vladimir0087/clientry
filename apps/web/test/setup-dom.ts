import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, vi } from 'vitest';

import { takeHeadingFocusRequest } from '@/shared/lib/heading-focus';

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

// A removed focused element leaves jsdom focused on the document, so the next focus blurs the
// window, which closes a Radix menu as it opens. Focusing and blurring a probe clears that.
function resetFocus(): void {
  const probe = document.createElement('button');
  document.body.append(probe);
  probe.focus();
  probe.blur();
  probe.remove();
}

afterEach(() => {
  cleanup();
  resetFocus();
  // A heading focus requested in one test must not land in the next.
  takeHeadingFocusRequest();
  // Sonner keeps toasts in a module-level store that outlives the Toaster of a test.
  toast.dismiss();
  vi.clearAllMocks();
  mockPathname.current = '/';
  window.localStorage.clear();
  document.documentElement.className = '';
});
