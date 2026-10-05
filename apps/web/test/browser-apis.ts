// jsdom lacks the APIs that Radix menus and next-themes call; these are inert stand-ins.
class ResizeObserverStub {
  observe = (): void => undefined;
  unobserve = (): void => undefined;
  disconnect = (): void => undefined;
}

function matchMediaStub(query: string): MediaQueryList {
  const list: MediaQueryList = {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  };
  return list;
}

export function installBrowserApis(): void {
  globalThis.ResizeObserver = ResizeObserverStub;
  window.matchMedia = matchMediaStub;
  Element.prototype.hasPointerCapture = (): boolean => false;
  Element.prototype.releasePointerCapture = (): void => undefined;
  Element.prototype.scrollIntoView = (): void => undefined;
}
