import { cn } from 'cn';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';

interface RetryMessageProps {
  readonly message: string;
  readonly onRetry: () => void;
  // Takes focus first, as the retry swaps this message and its button for a skeleton; null when
  // onRetry moves focus itself.
  readonly focusTargetId: string | null;
  // Smaller, for a place such as a popover list.
  readonly isCompact?: boolean;
}

export function RetryMessage({
  message,
  onRetry,
  focusTargetId,
  isCompact = false,
}: RetryMessageProps): React.JSX.Element {
  const handleClick = (): void => {
    if (focusTargetId !== null) {
      document.getElementById(focusTargetId)?.focus();
    }
    onRetry();
  };
  return (
    <div className={cn('flex flex-col items-start', isCompact ? 'gap-2 p-2 text-sm' : 'gap-3')}>
      <p>{message}</p>
      <Button
        type="button"
        variant="outline"
        size={isCompact ? 'sm' : 'default'}
        onClick={handleClick}
      >
        Try again
      </Button>
    </div>
  );
}
