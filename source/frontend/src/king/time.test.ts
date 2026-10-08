import { describe, expect, it } from 'vitest';
import { elapsedSince, kingMood } from './time';

const now = new Date('2026-10-08T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('elapsedSince', () => {
  it.each([
    [0, { kind: 'justNow' }],
    [59, { kind: 'justNow' }],
    [60, { kind: 'ago', value: 1, unit: 'minute' }],
    [59 * 60 + 59, { kind: 'ago', value: 59, unit: 'minute' }],
    [60 * 60, { kind: 'ago', value: 1, unit: 'hour' }],
    [23 * 3600 + 3599, { kind: 'ago', value: 23, unit: 'hour' }],
    [24 * 3600, { kind: 'ago', value: 1, unit: 'day' }],
    [3 * 24 * 3600, { kind: 'ago', value: 3, unit: 'day' }],
  ])('%i seconds ago is %o', (seconds, expected) => {
    expect(elapsedSince(ago(seconds), now)).toEqual(expected);
  });

  it('treats a slightly-future timestamp (clock skew) as just now', () => {
    expect(elapsedSince(new Date(now.getTime() + 5000), now)).toEqual({ kind: 'justNow' });
  });
});

describe('kingMood', () => {
  it('is hungry when he has never been fed', () => {
    expect(kingMood(null, now)).toBe('hungry');
  });

  it('is content up to and including 12 hours after a feeding', () => {
    expect(kingMood(ago(12 * 3600), now)).toBe('content');
  });

  it('is hungry after 12 hours', () => {
    expect(kingMood(ago(12 * 3600 + 1), now)).toBe('hungry');
  });
});
