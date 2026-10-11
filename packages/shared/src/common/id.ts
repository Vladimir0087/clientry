import { z } from 'zod';

// Services compare ids as strings, so an uppercase UUID is turned into the stored lowercase form.
export function idSchema(error?: string): z.ZodUUID {
  return (error === undefined ? z.uuid() : z.uuid({ error })).toLowerCase();
}
