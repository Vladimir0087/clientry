import { z } from 'zod';

import { clientSourceSchema } from './client-source.js';
import { CLIENT_LIMITS } from './limits.js';
import { textSchema } from '../common/text.js';

// A literal space, not \s: tabs and line breaks would be stored and shown as typed.
const PHONE_PATTERN = /^\+?[\d ().-]+$/;
const DIGIT = /\d/g;

function tooLong(max: number): string {
  return `Use at most ${String(max)} characters`;
}

// abort keeps one message per field, so a long value is not also reported as malformed.
function maxLength(max: number): { readonly error: string; readonly abort: true } {
  return { error: tooLong(max), abort: true };
}

const plainEmailSchema = z.email();

function isPhone(value: string): boolean {
  const digits = value.match(DIGIT)?.length ?? 0;
  return PHONE_PATTERN.test(value) && digits >= CLIENT_LIMITS.phoneMinDigits;
}

// '' and null both mean "no value": the form sends blank inputs as '' and the API stores NULL.
function optionalText(max: number): z.ZodOptional<z.ZodNullable<z.ZodString>> {
  return textSchema.trim().max(max, tooLong(max)).nullable().optional();
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(CLIENT_LIMITS.email, maxLength(CLIENT_LIMITS.email))
  .refine((value) => value === '' || plainEmailSchema.safeParse(value).success, {
    error: 'Enter a valid email',
  });

const phoneSchema = z
  .string()
  .trim()
  .max(CLIENT_LIMITS.phone, maxLength(CLIENT_LIMITS.phone))
  .refine((value) => value === '' || isPhone(value), { error: 'Enter a valid phone number' });

export const clientTagSchema = textSchema
  .trim()
  .toLowerCase()
  .min(1, { error: 'Enter a tag', abort: true })
  .max(CLIENT_LIMITS.tag, maxLength(CLIENT_LIMITS.tag))
  .regex(/^[^,]*$/, 'Tags cannot contain commas');

// The duplicate is reported on its own index, so the error lands on the tag that repeats.
const tagsSchema = z
  .array(clientTagSchema)
  .max(CLIENT_LIMITS.tags, `Use at most ${String(CLIENT_LIMITS.tags)} tags`)
  .superRefine((tags, context) => {
    tags.forEach((tag, index) => {
      if (tags.indexOf(tag) !== index) {
        context.addIssue({ code: 'custom', message: 'Tags must be unique', path: [index] });
      }
    });
  });

export const createClientRequestSchema = z
  .object({
    name: textSchema
      .trim()
      .min(1, { error: 'Enter a name', abort: true })
      .max(CLIENT_LIMITS.name, tooLong(CLIENT_LIMITS.name)),
    company: optionalText(CLIENT_LIMITS.company),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    source: clientSourceSchema.nullable().optional(),
    notes: optionalText(CLIENT_LIMITS.notes),
    tags: tagsSchema.optional(),
  })
  .meta({ id: 'CreateClientRequest' });

export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const updateClientRequestSchema = createClientRequestSchema
  .partial()
  .meta({ id: 'UpdateClientRequest' });

export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

export const clientIdParamsSchema = z.object({ id: z.uuid() });

export type ClientIdParams = z.infer<typeof clientIdParamsSchema>;
