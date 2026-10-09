import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import type { FormAlertContent } from '@/shared/lib/submit-error';

import { FormAlert } from './form-alert';

const ALERT: FormAlertContent = { message: 'Fix the fields' };

interface FormProps {
  readonly alert: FormAlertContent | null;
  readonly control: React.ReactNode;
}

function Form({ alert, control }: FormProps): React.JSX.Element {
  return (
    <form>
      <FormAlert alert={alert} />
      {control}
    </form>
  );
}

describe('FormAlert', () => {
  it.each([
    ['a textarea', <textarea key="control" aria-label="Control" />],
    [
      'a select trigger',
      <button
        key="control"
        type="button"
        role="combobox"
        aria-label="Control"
        aria-controls="listbox"
        aria-expanded="false"
      />,
    ],
  ])('should leave focus where it is when it sits on %s', (_case, control) => {
    const { rerender } = render(<Form alert={null} control={control} />);
    screen.getByLabelText('Control').focus();

    rerender(<Form alert={ALERT} control={control} />);

    expect(screen.getByLabelText('Control')).toHaveFocus();
  });

  it('should take focus when nothing in the form holds it', () => {
    render(<Form alert={ALERT} control={null} />);

    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
