import { z } from 'zod';

import { textSchema } from '../common/text.js';

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 100;

function tooLong(max: number): string {
  return `Use at most ${String(max)} characters`;
}

// abort keeps one message per field: an empty value reads "Enter …", not also a length error.
function required(message: string): { readonly error: string; readonly abort: true } {
  return { error: message, abort: true };
}

// Normalized before the format check: z.email().trim() validates first, so padded input fails.
// JSON Schema shows only the input side of a pipe, so the format is restated for Swagger.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, required('Enter your email'))
  .max(MAX_EMAIL_LENGTH, tooLong(MAX_EMAIL_LENGTH))
  .pipe(z.email('Enter a valid email'))
  .meta({ format: 'email' });

function nameSchema(emptyMessage: string): z.ZodString {
  return textSchema
    .trim()
    .min(1, required(emptyMessage))
    .max(MAX_NAME_LENGTH, tooLong(MAX_NAME_LENGTH));
}

const passwordSchema = z
  .string()
  .min(1, required('Enter your password'))
  .max(MAX_PASSWORD_LENGTH, tooLong(MAX_PASSWORD_LENGTH));

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema.min(
      MIN_PASSWORD_LENGTH,
      `Use at least ${String(MIN_PASSWORD_LENGTH)} characters`,
    ),
    name: nameSchema('Enter your name'),
    workspaceName: nameSchema('Enter a workspace name'),
  })
  .meta({ id: 'RegisterRequest' });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// Only presence is checked, so a stricter policy later never locks out existing accounts.
export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .meta({ id: 'LoginRequest' });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
