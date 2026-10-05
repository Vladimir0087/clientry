import { vi } from 'vitest';

// Shared by every jsdom test through the next/navigation mock in setup-dom.
export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
};
