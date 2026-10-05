import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';

interface SubmitButtonProps {
  readonly isSubmitting: boolean;
  readonly children: React.ReactNode;
}

// Disabled while pending, so a double click sends one request.
export function SubmitButton({ isSubmitting, children }: SubmitButtonProps): React.JSX.Element {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
      {isSubmitting && <Spinner data-icon="inline-start" aria-hidden="true" />}
      {children}
    </Button>
  );
}
