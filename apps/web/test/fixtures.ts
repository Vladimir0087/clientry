import { sessionResponseSchema } from '@clientry/shared/auth';
import type { SessionResponse } from '@clientry/shared/auth';

export const TEST_API_URL = 'http://api.test';

export const TEST_SESSION: SessionResponse = sessionResponseSchema.parse({
  user: { id: '0b6f2a8e-4c1d-4e7a-9f3b-2d5c8e1a7b40', email: 'ann@example.com', name: 'Ann Lee' },
  workspace: { id: '5e9d1c3b-7a2f-4b8e-a6d4-1f0c9e2b3a57', name: 'Acme Studio' },
  role: 'owner',
});
