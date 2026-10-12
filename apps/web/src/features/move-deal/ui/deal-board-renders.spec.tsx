import { fireEvent, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type * as DealEntity from '@/entities/deal';

import type * as ActionsMenu from './deal-actions-menu';
import { DealBoard } from './deal-board';
import { makeBoard, makeDeal, NEW_STAGE } from '../../../../test/deals';
import { renderWithProviders } from '../../../../test/render';

const renders = vi.hoisted(() => new Map<string, number>());

function countRender(key: string): void {
  renders.set(key, (renders.get(key) ?? 0) + 1);
}

// Counted as plain components: the board itself must keep them from rendering again.
vi.mock('@/entities/deal', async (importOriginal) => {
  const actual = await importOriginal<typeof DealEntity>();
  function CountedCardBody(
    props: React.ComponentProps<typeof actual.DealCardBody>,
  ): React.JSX.Element {
    // The drag overlay is a new picture of the lifted card.
    if (props.isStatic !== true) {
      countRender(`body:${props.deal.id}`);
    }
    return <actual.DealCardBody {...props} />;
  }
  function CountedColumnHeader(
    props: React.ComponentProps<typeof actual.BoardColumnHeader>,
  ): React.JSX.Element {
    countRender(`header:${props.column.stage.id}`);
    return <actual.BoardColumnHeader {...props} />;
  }
  return { ...actual, DealCardBody: CountedCardBody, BoardColumnHeader: CountedColumnHeader };
});

vi.mock('./deal-actions-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof ActionsMenu>();
  function CountedActionsMenu(
    props: React.ComponentProps<typeof actual.DealActionsMenu>,
  ): React.JSX.Element {
    countRender(`menu:${props.title}`);
    return <actual.DealActionsMenu {...props} />;
  }
  return { ...actual, DealActionsMenu: CountedActionsMenu };
});

const DRAGGED = makeDeal(1, { stage: NEW_STAGE });
const STILL = makeDeal(2, { stage: NEW_STAGE });
const BOARD = makeBoard([DRAGGED, STILL]);

function pointerTo(target: Document | Element, clientY: number): void {
  fireEvent.pointerMove(target, { clientX: 0, clientY, isPrimary: true, button: 0 });
}

describe('DealBoard rendering', () => {
  it('should render no card content or column header again when a card is picked up and dragged', () => {
    renderWithProviders(<DealBoard board={BOARD} headingId="deals-heading" />);
    const before = new Map(renders);
    const handle = screen.getByRole('button', { name: `Drag ${DRAGGED.title}` });

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, isPrimary: true, button: 0 });
    for (const clientY of [10, 20, 30, 40, 50, 60]) {
      pointerTo(document, clientY);
    }

    expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect(new Map(renders)).toEqual(before);
    fireEvent.pointerUp(document, { clientX: 0, clientY: 60, isPrimary: true, button: 0 });
  });
});
