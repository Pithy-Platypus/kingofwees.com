import { describe, expect, it } from 'vitest';
import { blockedStorage, memoryStorage } from '../test/memoryStorage';
import { getReporterKey, loadNickname, saveNickname } from './reporter';

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
    expect(getReporterKey(blockedStorage)).toMatch(/^[0-9a-f-]{36}$/);
    expect(getReporterKey(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('nickname', () => {
  it('is null on a device that has never been asked', () => {
    expect(loadNickname(memoryStorage())).toBeNull();
  });

  it('is remembered, without surrounding spaces', () => {
    const storage = memoryStorage();

    saveNickname(storage, '  Sunny ');

    expect(loadNickname(storage)).toBe('Sunny');
  });

  it('remembers a skip as an empty name, so the device is not asked again', () => {
    const storage = memoryStorage();

    saveNickname(storage, '');

    expect(loadNickname(storage)).toBe('');
  });

  it('is never asked about again on one device, but each device is asked once', () => {
    const storage = memoryStorage();
    saveNickname(storage, 'Sunny');

    expect(loadNickname(memoryStorage())).toBeNull();
    expect(loadNickname(storage)).toBe('Sunny');
  });

  it('is null when storage is unavailable or throws, and saving there does not throw', () => {
    expect(loadNickname(blockedStorage)).toBeNull();
    expect(loadNickname(undefined)).toBeNull();
    expect(() => saveNickname(blockedStorage, 'Sunny')).not.toThrow();
  });
});
