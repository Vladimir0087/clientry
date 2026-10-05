import { CircleAlertIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type * as React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';

import type { FormAlertContent } from '../model/submit-error';

interface FormAlertProps {
  readonly alert: FormAlertContent | null;
}

export function FormAlert({ alert }: FormAlertProps): React.JSX.Element | null {
  const alertRef = useRef<HTMLDivElement>(null);

  // The pending submit button lost focus when it was disabled; a field the form focused keeps it.
  useEffect(() => {
    if (alert !== null && !(document.activeElement instanceof HTMLInputElement)) {
      alertRef.current?.focus();
    }
  }, [alert]);

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
    </Alert>
  );
}
