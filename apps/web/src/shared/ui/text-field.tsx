import type * as React from 'react';

import { Input } from '@/shared/ui/input';

import { FormField } from './form-field';
import type { FormFieldProps } from './form-field';

export type TextFieldProps = FormFieldProps & Omit<React.ComponentProps<'input'>, 'id'>;

export function TextField({
  label,
  error,
  hint,
  ...inputProps
}: TextFieldProps): React.JSX.Element {
  return (
    <FormField label={label} error={error} hint={hint}>
      {(control) => <Input {...inputProps} {...control} />}
    </FormField>
  );
}
