import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState } from 'react';
import type * as React from 'react';

import { FormField } from '@/shared/ui/form-field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shared/ui/input-group';
import type { TextFieldProps } from '@/shared/ui/text-field';

export function PasswordField({
  label,
  error,
  hint,
  ...inputProps
}: Omit<TextFieldProps, 'type'>): React.JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const handleToggle = (): void => {
    setIsVisible((isShown) => !isShown);
  };
  return (
    <FormField label={label} error={error} hint={hint}>
      {(control) => (
        <InputGroup>
          <InputGroupInput {...inputProps} {...control} type={isVisible ? 'text' : 'password'} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Show password"
              aria-pressed={isVisible}
              onClick={handleToggle}
            >
              {isVisible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </FormField>
  );
}
