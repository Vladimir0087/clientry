import { useId } from 'react';
import type * as React from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';

export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string | undefined;
}

export interface FormFieldProps {
  readonly label: string;
  readonly error: string | undefined;
  readonly hint?: string;
}

interface FormFieldShellProps extends FormFieldProps {
  readonly children: (control: FieldControlProps) => React.ReactNode;
}

export function FormField({
  label,
  error,
  hint,
  children,
}: FormFieldShellProps): React.JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const isInvalid = error !== undefined;
  const describedBy = [hint === undefined ? '' : hintId, isInvalid ? errorId : '']
    .filter((part) => part !== '')
    .join(' ');
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({ id, 'aria-invalid': isInvalid, 'aria-describedby': describedBy || undefined })}
      {hint !== undefined && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {isInvalid && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
