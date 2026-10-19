import { describe, expect, it } from 'vitest';

import { sessionResponseSchema } from './session.js';

const SESSION = {
  user: { id: '0199d0a0-0000-7000-8000-000000000001', email: 'ann@studio.dev', name: 'Ann' },
  workspace: { id: '0199d0a0-0000-7000-8000-000000000100', name: 'Pixel Studio', isDemo: false },
  role: 'owner',
};

describe('sessionResponseSchema', () => {
  it('should accept the session when the workspace says whether it is the demo', () => {
    expect(sessionResponseSchema.safeParse(SESSION).success).toBe(true);
  });

  it('should reject the session on workspace.isDemo when the flag is missing', () => {
    const workspace = { id: SESSION.workspace.id, name: SESSION.workspace.name };

    const result = sessionResponseSchema.safeParse({ ...SESSION, workspace });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['workspace.isDemo']);
  });
});
