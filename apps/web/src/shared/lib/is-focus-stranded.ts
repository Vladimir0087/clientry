// Focus the user has not moved on from: dropped to the body as its element left or was disabled,
// or kept by a disabled button, as some browsers do.
export function isFocusStranded(): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    (active instanceof HTMLButtonElement && active.disabled)
  );
}
