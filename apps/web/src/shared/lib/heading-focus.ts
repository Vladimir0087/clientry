let isHeadingFocusRequested = false;

// Called right before a navigation the app makes itself; links and Back keep the router's focus.
export function requestHeadingFocus(): void {
  isHeadingFocusRequested = true;
}

export function takeHeadingFocusRequest(): boolean {
  const isRequested = isHeadingFocusRequested;
  isHeadingFocusRequested = false;
  return isRequested;
}
