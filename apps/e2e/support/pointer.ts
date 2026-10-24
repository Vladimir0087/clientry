import type { Locator, Page } from '@playwright/test';

import { centerOf } from './geometry.js';
import type { Point } from './geometry.js';
import { pause } from './pause.js';

// About one move per frame at 60 Hz, so the drawn pointer glides rather than jumps.
const STEP_MS = 16;
const GLIDE_MS = 550;
const DRAG_MS = 1000;
const PRESS_MS = 150;

// Sent to the page as source text, so it must not reach anything outside its own body.
// Runs before the page's own scripts, on every document of the context.
function installPointer(): void {
  if (!location.protocol.startsWith('http')) {
    return;
  }
  const STORAGE_KEY = 'media-pointer';
  let pointer: HTMLElement | undefined;

  const place = (x: number, y: number): void => {
    if (pointer === undefined) {
      pointer = document.createElement('div');
      pointer.setAttribute('aria-hidden', 'true');
      pointer.style.cssText =
        'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:scale 80ms;transform-origin:3px 2px';
      pointer.innerHTML =
        '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M3 2v20l5-5 4 9 4-2-4-9h7z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.body.append(pointer);
    }
    pointer.style.translate = `${String(x - 3)}px ${String(y - 2)}px`;
  };
  const press = (isPressed: boolean): void => {
    if (pointer !== undefined) {
      pointer.style.scale = isPressed ? '0.85' : '1';
    }
  };

  const listen = { capture: true, passive: true };
  window.addEventListener(
    'pointermove',
    (event) => {
      place(event.clientX, event.clientY);
      sessionStorage.setItem(STORAGE_KEY, `${String(event.clientX)},${String(event.clientY)}`);
    },
    listen,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      press(true);
    },
    listen,
  );
  window.addEventListener(
    'pointerup',
    () => {
      press(false);
    },
    listen,
  );
  // A full navigation starts a new document: the pointer comes back where the last one left it.
  window.addEventListener('load', () => {
    const [x, y] = (sessionStorage.getItem(STORAGE_KEY) ?? '').split(',').map(Number);
    if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
      place(x, y);
    }
  });
}

// Eases in and out, as a hand starts and stops.
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export interface Pointer {
  readonly moveTo: (target: Locator) => Promise<void>;
  readonly click: (target: Locator) => Promise<void>;
  readonly drag: (handle: Locator, target: Locator) => Promise<void>;
}

// Headless frames show no cursor, so the page draws one that follows the mouse and takes no input.
export async function drawPointer(page: Page, start: Point): Promise<Pointer> {
  await page.addInitScript(installPointer);
  let at = start;

  const glide = async (to: Point, durationMs: number): Promise<void> => {
    const from = at;
    const steps = Math.max(1, Math.round(durationMs / STEP_MS));
    for (let step = 1; step <= steps; step += 1) {
      const t = ease(step / steps);
      await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      await pause(STEP_MS);
    }
    at = to;
  };

  const moveTo = async (target: Locator): Promise<void> => {
    await glide(await centerOf(target), GLIDE_MS);
  };

  const click = async (target: Locator): Promise<void> => {
    await moveTo(target);
    await page.mouse.down();
    await pause(PRESS_MS);
    await page.mouse.up();
  };

  // The board's pointer sensor starts a drag only after the pointer has moved 4 px.
  const drag = async (handle: Locator, target: Locator): Promise<void> => {
    await moveTo(handle);
    await page.mouse.down();
    await pause(PRESS_MS);
    await glide({ x: at.x + 12, y: at.y }, PRESS_MS);
    await glide(await centerOf(target), DRAG_MS);
    await pause(PRESS_MS);
    await page.mouse.up();
  };

  return { moveTo, click, drag };
}
