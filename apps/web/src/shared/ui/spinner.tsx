import { cn } from 'cn';
import { Loader2Icon } from 'lucide-react';
import type * as React from 'react';

interface SpinnerProps extends React.ComponentProps<'svg'> {
  // Hidden from assistive technology, without the status role, for a place that says it in text.
  readonly isDecorative?: boolean;
}

function Spinner({ className, isDecorative = false, ...props }: SpinnerProps): React.JSX.Element {
  const semantics = isDecorative
    ? { 'aria-hidden': true }
    : { role: 'status', 'aria-label': 'Loading' };
  return (
    <Loader2Icon
      data-slot="spinner"
      {...semantics}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
