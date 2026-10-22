import type { Page } from '@playwright/test';
import sharp from 'sharp';

// A multiple of 10 ms, GIF's unit; browsers stretch delays under 20 ms to 100 ms.
const FRAME_MS = 70;

interface Shot {
  readonly frame: Buffer;
  delay: number;
}

class RecorderError extends Error {
  override readonly name = 'RecorderError';
}

export interface Recording {
  // Stops capturing and encodes a looping GIF in which each frame lasts as long as the page showed it.
  readonly toGif: (width: number) => Promise<Buffer>;
}

// Holds every frame until the next one, so a page that does not repaint costs no frames.
function timeline(slots: ReadonlyMap<number, Buffer>, slotCount: number): readonly Shot[] {
  const shots: Shot[] = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    const frame = slots.get(slot);
    const last = shots.at(-1);
    if (frame !== undefined) {
      shots.push({ frame, delay: FRAME_MS });
    } else if (last !== undefined) {
      last.delay += FRAME_MS;
    }
  }
  return shots;
}

async function encode(shots: readonly Shot[], width: number): Promise<Buffer> {
  if (shots.length === 0) {
    throw new RecorderError('The screencast delivered no frames');
  }
  // Frame by frame: sharp resizes a joined animation as one image and keeps a single frame.
  const frames = await Promise.all(
    shots.map(({ frame }) =>
      sharp(frame).resize({ width }).png({ compressionLevel: 1 }).toBuffer(),
    ),
  );
  return sharp(frames, { join: { animated: true } })
    .gif({
      loop: 0,
      delay: shots.map(({ delay }) => delay),
      // Flat interface colors need no dithering. A lossy inter-frame error would leave faint
      // ghosts of the previous page on white backgrounds, so it stays at its lossless default.
      dither: 0,
    })
    .toBuffer();
}

// Frames arrive whenever the page paints, with the time of the paint; the latest in each slot is kept.
export async function startRecording(page: Page): Promise<Recording> {
  const size = page.viewportSize();
  if (size === null) {
    throw new RecorderError('The page has no fixed viewport to record');
  }
  const startedAt = Date.now();
  const slots = new Map<number, Buffer>();
  await page.screencast.start({
    size,
    quality: 100,
    // A frame painted before the start is what the page shows when the recording starts.
    onFrame: ({ data, timestamp }) => {
      slots.set(Math.max(0, Math.floor((timestamp - startedAt) / FRAME_MS)), data);
    },
  });
  return {
    toGif: async (width) => {
      const slotCount = Math.ceil((Date.now() - startedAt) / FRAME_MS);
      await page.screencast.stop();
      return encode(timeline(slots, slotCount), width);
    },
  };
}
