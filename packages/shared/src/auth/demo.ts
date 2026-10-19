import { z } from 'zod';

import { memberRoleSchema } from './member-role.js';

export const demoLoginRequestSchema = z
  .object({ role: memberRoleSchema })
  .meta({ id: 'DemoLoginRequest' });

export type DemoLoginRequest = z.infer<typeof demoLoginRequestSchema>;
