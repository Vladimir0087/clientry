import type * as React from 'react';
import { Controller } from 'react-hook-form';
import type { Control, FieldErrors } from 'react-hook-form';

import { useClientTags } from '@/entities/client';
import { FormField } from '@/shared/ui/form-field';
import { CLIENT_LIMITS } from '@clientry/shared/clients';

import { SourceSelect } from './source-select';
import { TagInput } from './tag-input';
import type { ClientFormValues } from '../model/client-form-values';

const TAGS_HINT = 'Press Enter or comma to add a tag.';
const TAGS_FULL_HINT = `You can add up to ${String(CLIENT_LIMITS.tags)} tags. Remove one to add another.`;

interface ControlledFieldProps {
  readonly control: Control<ClientFormValues>;
  readonly errors: FieldErrors<ClientFormValues>;
}

function hasMessage(value: unknown): value is { readonly message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

// Server errors land on the list itself, the schema's on the tag that failed.
function tagsError(errors: FieldErrors<ClientFormValues>): string | undefined {
  const error = errors.tags;
  if (error === undefined) {
    return undefined;
  }
  return error.message ?? Object.values(error).find(hasMessage)?.message;
}

export function SourceField({ control, errors }: ControlledFieldProps): React.JSX.Element {
  return (
    <Controller
      control={control}
      name="source"
      render={({ field }) => (
        <FormField label="Source" error={errors.source?.message}>
          {(fieldControl) => (
            <SourceSelect
              {...fieldControl}
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        </FormField>
      )}
    />
  );
}

export function TagsField({ control, errors }: ControlledFieldProps): React.JSX.Element {
  const tags = useClientTags();
  const suggestions = (tags.data?.items ?? []).map(({ tag }) => tag);
  return (
    <Controller
      control={control}
      name="tags"
      render={({ field }) => {
        const value = field.value ?? [];
        const hint = value.length >= CLIENT_LIMITS.tags ? TAGS_FULL_HINT : TAGS_HINT;
        return (
          <FormField label="Tags" hint={hint} error={tagsError(errors)}>
            {(fieldControl) => (
              <TagInput
                {...fieldControl}
                ref={field.ref}
                value={value}
                suggestions={suggestions}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>
        );
      }}
    />
  );
}
