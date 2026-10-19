import { CircleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type * as React from 'react';

import type { FormAlertContent } from '@/shared/lib/submit-error';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

// The select trigger is a button with the combobox role.
function isFormControl(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element?.getAttribute('role') === 'combobox'
  );
}

interface FormAlertProps {
  readonly alert: FormAlertContent | null;
  // Off where the caller returns focus to the control that failed; the alert is still announced.
  readonly shouldFocus?: boolean;
}

export function FormAlert({ alert, shouldFocus = true }: FormAlertProps): React.JSX.Element | null {
  const alertRef = useRef<HTMLDivElement>(null);

  // The pending submit button lost focus when it was disabled; a field the form focused keeps it.
  useEffect(() => {
    if (shouldFocus && alert !== null && !isFormControl(document.activeElement)) {
      alertRef.current?.focus();
    }
  }, [alert, shouldFocus]);

  if (alert === null) {
    return null;
  }
  return (
    <Alert ref={alertRef} tabIndex={-1} variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{alert.message}</AlertTitle>
      {alert.reference !== undefined && (
        <AlertDescription>Reference: {alert.reference}</AlertDescription>
      )}
      {alert.action !== undefined && (
        <AlertDescription>
          <Button type="button" variant="outline" size="sm" onClick={alert.action.onClick}>
            {alert.action.label}
          </Button>
        </AlertDescription>
      )}
      {alert.link !== undefined && (
        <AlertDescription>
          <Link href={alert.link.href} className="underline underline-offset-4">
            {alert.link.label}
          </Link>
        </AlertDescription>
      )}
    </Alert>
  );
}
