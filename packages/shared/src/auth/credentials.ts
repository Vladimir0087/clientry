import { z } from 'zod';

import { textSchema } from '../common/text.js';

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 100;

// Normalized before the format check: z.email().trim() validates first, so padded input fails.
// JSON Schema shows only the input side of a pipe, so the format is restated for Swagger.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH)
  .pipe(z.email())
  .meta({ format: 'email' });

const nameSchema = textSchema.trim().min(1).max(MAX_NAME_LENGTH);

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    name: nameSchema,
    workspaceName: nameSchema,
  })
  .meta({ id: 'RegisterRequest' });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// Only presence is checked, so a stricter policy later never locks out existing accounts.
export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .meta({ id: 'LoginRequest' });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
