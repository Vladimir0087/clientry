import type * as React from 'react';

import { CLIENT_SOURCES, sourceLabel } from '@/entities/client';
import type { FieldControlProps } from '@/shared/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import type { ClientSource } from '@clientry/shared/clients';

// Radix Select allows no item with an empty value, so "Not set" stands in for null.
const NOT_SET = 'not-set';

interface SourceSelectProps extends FieldControlProps {
  readonly value: ClientSource | null | undefined;
  readonly onChange: (source: ClientSource | null) => void;
  readonly onBlur: () => void;
  readonly ref: React.Ref<HTMLButtonElement>;
}

export function SourceSelect({
  value,
  onChange,
  onBlur,
  ref,
  ...control
}: SourceSelectProps): React.JSX.Element {
  const handleChange = (next: string): void => {
    onChange(CLIENT_SOURCES.find((source) => source === next) ?? null);
  };
  return (
    <Select value={value ?? NOT_SET} onValueChange={handleChange}>
      <SelectTrigger {...control} ref={ref} onBlur={onBlur} className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={NOT_SET}>Not set</SelectItem>
        {CLIENT_SOURCES.map((source) => (
          <SelectItem key={source} value={source}>
            {sourceLabel(source)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
