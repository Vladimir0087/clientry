import type * as React from 'react';

import type { FieldControlProps } from '@/shared/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly isDisabled?: boolean;
}

interface OptionSelectProps extends FieldControlProps {
  readonly options: readonly SelectOption[];
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly ref?: React.Ref<HTMLButtonElement>;
  readonly className?: string;
  readonly isDisabled?: boolean;
  readonly onOpen?: () => void;
}

export function OptionSelect({
  options,
  value,
  onChange,
  onBlur,
  ref,
  className,
  isDisabled = false,
  onOpen,
  ...control
}: OptionSelectProps): React.JSX.Element {
  const handleOpenChange = (isOpen: boolean): void => {
    if (isOpen) {
      onOpen?.();
    }
  };
  return (
    <Select
      value={value}
      disabled={isDisabled}
      onValueChange={onChange}
      onOpenChange={handleOpenChange}
    >
      <SelectTrigger {...control} ref={ref} onBlur={onBlur} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.isDisabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
