import { describe, expect, it, vi } from 'vitest';
import { encodeUnder, fitWithin, MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES } from './photo';

describe('fitWithin', () => {
  it.each([
    [4032, 3024, 1600, 1600, 1200],
    [3024, 4032, 1600, 1200, 1600],
    [4000, 4000, 400, 400, 400],
    [1001, 333, 400, 400, 133],
  ])('shrinks %i×%i to fit %i px: %i×%i', (width, height, longest, expectedWidth, expectedHeight) => {
    expect(fitWithin(width, height, longest)).toEqual({ width: expectedWidth, height: expectedHeight });
  });

  it('never enlarges a photo already small enough', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('keeps at least one pixel on a very thin photo', () => {
    expect(fitWithin(10_000, 1, 400)).toEqual({ width: 400, height: 1 });
  });
});

const ofSize = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });

describe('encodeUnder', () => {
  it('keeps the first, best quality that fits', async () => {
    const encode = vi.fn(async () => ofSize(500));

    const blob = await encodeUnder(encode, 1000);

    expect(blob.size).toBe(500);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith(0.85);
  });

  it('steps the quality down until the photo fits', async () => {
    const sizes: Record<number, number> = { 0.85: 3000, 0.7: 1500, 0.55: 1000 };
    const encode = vi.fn(async (quality: number) => ofSize(sizes[quality] ?? 10));

    const blob = await encodeUnder(encode, 1000);

    expect(blob.size).toBe(1000);
    expect(encode.mock.calls.map(([quality]) => quality)).toEqual([0.85, 0.7, 0.55]);
  });

  it('gives up when even the lowest quality is too big, or the browser can’t encode', async () => {
    await expect(encodeUnder(async () => ofSize(2000), 1000)).rejects.toThrow();
    await expect(encodeUnder(async () => null, 1000)).rejects.toThrow();
  });

  it('matches the server’s limits: 1 MiB for the photo, 100 KiB for the thumbnail', () => {
    expect(MAX_PHOTO_BYTES).toBe(1024 * 1024);
    expect(MAX_THUMBNAIL_BYTES).toBe(100 * 1024);
  });
});
