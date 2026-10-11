interface Held {
  readonly promise: Promise<void>;
  readonly release: () => void;
}

// A response that waits until the test lets it go.
export function held(): Held {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release: () => {
      release();
    },
  };
}
