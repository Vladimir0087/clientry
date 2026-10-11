import { KeyboardCode } from '@dnd-kit/core';
import type { DroppableContainer, KeyboardCoordinateGetter, UniqueIdentifier } from '@dnd-kit/core';
import { hasSortableData, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

const VERTICAL_KEYS: ReadonlySet<string> = new Set<string>([KeyboardCode.Up, KeyboardCode.Down]);

// The column a card is sorted in; columns themselves carry no sortable data.
function columnOf(droppable: DroppableContainer | undefined): UniqueIdentifier | undefined {
  return hasSortableData(droppable) ? droppable.data.current.sortable.containerId : undefined;
}

// Up and Down stay in the card's column: dnd-kit's own getter takes the nearest card below or
// above in any column. Left and Right keep its behaviour.
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { droppableContainers, droppableRects } = args.context;
  const column = columnOf(droppableContainers.get(args.active));
  if (!VERTICAL_KEYS.has(event.code) || column === undefined) {
    return sortableKeyboardCoordinates(event, args);
  }
  // The getter skips droppables it has no rect for.
  const columnRects = new Map(
    [...droppableRects].filter(([id]) => columnOf(droppableContainers.get(id)) === column),
  );
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...args.context, droppableRects: columnRects },
  });
};
