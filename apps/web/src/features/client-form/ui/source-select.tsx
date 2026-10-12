import type * as React from 'react';

import { CLIENT_SOURCES, sourceLabel } from '@/entities/client';
import type { FieldControlProps } from '@/shared/ui/form-field';
import { OptionSelect } from '@/shared/ui/option-select';
import type { SelectOption } from '@/shared/ui/option-select';
import type { ClientSource } from '@clientry/shared/clients';

// Radix Select allows no item with an empty value, so "Not set" stands in for null.
const NOT_SET = 'not-set';

const SOURCE_OPTIONS: readonly SelectOption[] = [
  { value: NOT_SET, label: 'Not set' },
  ...CLIENT_SOURCES.map((source) => ({ value: source, label: sourceLabel(source) })),
];

interface SourceSelectProps extends FieldControlProps {
  readonly value: ClientSource | null | undefined;
  readonly onChange: (source: ClientSource | null) => void;
  readonly onBlur: () => void;
  readonly ref: React.Ref<HTMLButtonElement>;
}

export function SourceSelect({ value, onChange, ...select }: SourceSelectProps): React.JSX.Element {
  const handleChange = (next: string): void => {
    onChange(CLIENT_SOURCES.find((source) => source === next) ?? null);
  };
  return (
    <OptionSelect
      {...select}
      options={SOURCE_OPTIONS}
      value={value ?? NOT_SET}
      onChange={handleChange}
      className="w-full sm:w-56"
    />
  );
}
