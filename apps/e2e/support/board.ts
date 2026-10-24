import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import type { SessionResponse } from '@clientry/shared/auth';
import type { Deal } from '@clientry/shared/deals';

import { createClient, createDeal, findStage } from './api.js';
import { centerOf } from './geometry.js';

// dnd-kit mounts its instructions only in the browser, so a described handle means a hydrated board.
export async function dragHandle(page: Page, title: string): Promise<Locator> {
  const handle = page.getByRole('button', { name: `Drag ${title}` });
  await expect(handle).toHaveAccessibleDescription(/^Press Space to pick up a deal\./);
  return handle;
}

// A closed stage's heading also holds its Won or Lost badge.
export function column(page: Page, stage: string): Locator {
  return page.getByRole('region', { name: new RegExp(`^${stage}( (Won|Lost))?$`) });
}

export interface DealArrangement {
  readonly title: string;
  readonly stage?: string;
  readonly amount?: number;
  readonly clientName?: string;
}

export async function arrangeDeal(
  page: Page,
  owner: SessionResponse,
  { title, stage = 'New', amount = 150_000, clientName = 'Romashka LLC' }: DealArrangement,
): Promise<Deal> {
  const client = await createClient(page.request, { name: clientName });
  const { id: stageId } = await findStage(page.request, stage);
  return createDeal(page.request, {
    title,
    clientId: client.id,
    stageId,
    amount,
    currency: 'USD',
    assigneeId: owner.user.id,
  });
}

// Small steps, as a hand moves: the pointer sensor starts a drag only after 4 px.
export async function dragWithMouse(page: Page, handle: Locator, target: Locator): Promise<void> {
  const from = await centerOf(handle);
  const to = await centerOf(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}
