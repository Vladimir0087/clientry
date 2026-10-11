import type * as React from 'react';

import type { FieldControlProps } from '@/shared/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface OptionSelectProps extends FieldControlProps {
  readonly options: readonly SelectOption[];
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  readonly ref: React.Ref<HTMLButtonElement>;
  readonly className?: string;
}

export function OptionSelect({
  options,
  value,
  onChange,
  onBlur,
  ref,
  className,
  ...control
}: OptionSelectProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger {...control} ref={ref} onBlur={onBlur} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
