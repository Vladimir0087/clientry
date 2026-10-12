let isHeadingFocusRequested = false;

// Called right before a navigation the app makes itself; links and Back keep the router's focus.
export function requestHeadingFocus(): void {
  isHeadingFocusRequested = true;
}

// For a page already in view: its heading mounted before any request could reach it.
export function focusPageHeading(): void {
  document.querySelector<HTMLElement>('main h1')?.focus();
}

export function takeHeadingFocusRequest(): boolean {
  const isRequested = isHeadingFocusRequested;
  isHeadingFocusRequested = false;
  return isRequested;
}
