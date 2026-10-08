export type Elapsed = { kind: 'justNow' } | { kind: 'ago'; value: number; unit: 'minute' | 'hour' | 'day' };

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const HUNGRY_AFTER_SECONDS = 12 * HOUR;

const secondsBetween = (then: Date, now: Date) => Math.floor((now.getTime() - then.getTime()) / 1000);

export function elapsedSince(then: Date, now: Date): Elapsed {
  const seconds = secondsBetween(then, now);
  if (seconds < MINUTE) return { kind: 'justNow' };
  if (seconds < HOUR) return { kind: 'ago', value: Math.floor(seconds / MINUTE), unit: 'minute' };
  if (seconds < DAY) return { kind: 'ago', value: Math.floor(seconds / HOUR), unit: 'hour' };
  return { kind: 'ago', value: Math.floor(seconds / DAY), unit: 'day' };
}

export type Mood = 'content' | 'hungry';

export function kingMood(lastFed: Date | null, now: Date): Mood {
  return lastFed === null || secondsBetween(lastFed, now) > HUNGRY_AFTER_SECONDS ? 'hungry' : 'content';
}
