import type * as React from 'react';

// For controls under a form: a blur error would shift the control before the click lands.
export function handleKeepFieldFocus(event: React.MouseEvent): void {
  event.preventDefault();
}
