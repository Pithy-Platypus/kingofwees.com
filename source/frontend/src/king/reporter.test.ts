import { describe, expect, it } from 'vitest';
import { getReporterKey } from './reporter';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('getReporterKey', () => {
  it('creates a key once and returns the same key afterwards', () => {
    const storage = memoryStorage();

    const first = getReporterKey(storage);

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getReporterKey(storage)).toBe(first);
  });

  it('gives different devices different keys', () => {
    expect(getReporterKey(memoryStorage())).not.toBe(getReporterKey(memoryStorage()));
  });

  it('still returns a key when storage is unavailable or throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(getReporterKey(throwing)).toMatch(/^[0-9a-f-]{36}$/);
    expect(getReporterKey(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
