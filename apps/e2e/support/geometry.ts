import type { Locator } from '@playwright/test';

export interface Point {
  readonly x: number;
  readonly y: number;
}

class GeometryError extends Error {
  override readonly name = 'GeometryError';
}

export async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new GeometryError(`${locator.toString()} is not on screen`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
