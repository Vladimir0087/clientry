import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// Both layouts of a list may hold a link per row; focus lands on the one that can take it.
function focusItem(container: HTMLElement | null, attribute: string, index: number): void {
  const links = container?.querySelectorAll<HTMLElement>(`[${attribute}="${String(index)}"]`);
  for (const link of links ?? []) {
    link.focus();
    if (document.activeElement === link) {
      return;
    }
  }
}

// Focus stays on "Load more" while pages arrive; once it disappears, the first new item takes it,
// or the last item when the final page came back empty. Returns the handler for a press.
export function useLoadMoreFocus(
  containerRef: RefObject<HTMLElement | null>,
  attribute: string,
  itemCount: number,
  hasNextPage: boolean,
): () => void {
  const pendingIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const index = pendingIndexRef.current;
    if (index === null || (itemCount <= index && hasNextPage)) {
      return;
    }
    pendingIndexRef.current = null;
    if (!hasNextPage) {
      focusItem(containerRef.current, attribute, Math.min(index, itemCount - 1));
    }
  }, [containerRef, attribute, itemCount, hasNextPage]);
  return () => {
    pendingIndexRef.current = itemCount;
  };
}
