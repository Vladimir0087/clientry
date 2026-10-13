import { z } from 'zod';

import { idSchema } from '../common/id.js';

// "me" is the caller; an id that is not a member still filters, so former members stay findable.
export const memberFilterSchema = z.union([z.literal('me'), idSchema()]);

export type MemberFilter = z.infer<typeof memberFilterSchema>;
