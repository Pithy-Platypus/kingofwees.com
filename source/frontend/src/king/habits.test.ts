import { describe, expect, it } from 'vitest';
import type { HabitEntry } from './api';
import { byHour, fedDays, menu, moodShare } from './habits';

// Local times throughout: the charts bucket in the reader's own zone, as the log does.
const now = new Date(2026, 10, 11, 12, 0); // Wednesday 11 November 2026, noon
const local = (year: number, month: number, day: number, hour = 9) => new Date(year, month, day, hour).toISOString();
const fed = (occurredAt: string, foods: HabitEntry['foods'] = ['wet'], sawKing = true): HabitEntry => ({ occurredAt, kind: 'fed', sawKing, foods });
const seen = (occurredAt: string): HabitEntry => ({ occurredAt, kind: 'seen', sawKing: true, foods: [] });

describe('byHour', () => {
  it('has 24 empty hours with nothing logged', () => {
    const hours = byHour([]);

    expect(hours).toHaveLength(24);
    expect(hours.every((h) => h.fed === 0 && h.seen === 0)).toBe(true);
  });

  it('counts feedings and times seen by the local hour; a feeding where King was seen counts as both', () => {
    const hours = byHour([
      fed(local(2026, 10, 10, 7)),
      fed(local(2026, 10, 9, 7), ['dry'], false),
      seen(local(2026, 10, 10, 7)),
      seen(local(2026, 10, 8, 16)),
    ]);

    expect(hours[7]).toEqual({ fed: 2, seen: 2 });
    expect(hours[16]).toEqual({ fed: 0, seen: 1 });
    expect(hours[8]).toEqual({ fed: 0, seen: 0 });
  });
});

describe('fedDays', () => {
  it('covers the last 35 local days ending today, oldest first, none fed', () => {
    const { days, fedCount, longestRun, currentRun } = fedDays([], now);

    expect(days).toHaveLength(35);
    expect(days[0]!.date).toEqual(new Date(2026, 9, 8));
    expect(days[34]!.date).toEqual(new Date(2026, 10, 11));
    expect(days.every((d) => !d.fed)).toBe(true);
    expect({ fedCount, longestRun, currentRun }).toEqual({ fedCount: 0, longestRun: 0, currentRun: 0 });
  });

  it('marks fed days once however many feedings, and ignores sightings and days before the window', () => {
    const { days, fedCount } = fedDays(
      [fed(local(2026, 10, 11, 7)), fed(local(2026, 10, 11, 16)), seen(local(2026, 10, 10)), fed(local(2026, 9, 7, 23))],
      now,
    );

    expect(days[34]).toEqual({ date: new Date(2026, 10, 11), fed: true });
    expect(days[33]!.fed).toBe(false);
    expect(fedCount).toBe(1);
  });

  it('counts the longest run inside the window and the current run ending today', () => {
    const entries = [1, 2, 3, 9, 10, 11].map((day) => fed(local(2026, 10, day)));

    const { longestRun, currentRun } = fedDays(entries, now);

    expect({ longestRun, currentRun }).toEqual({ longestRun: 3, currentRun: 3 });
  });

  it('keeps the current run alive before today’s first meal, ending yesterday', () => {
    const entries = [8, 9, 10].map((day) => fed(local(2026, 10, day)));

    expect(fedDays(entries, now).currentRun).toBe(3);
  });

  it('ends the current run at zero when neither today nor yesterday was fed', () => {
    const entries = [7, 8, 9].map((day) => fed(local(2026, 10, day)));

    expect(fedDays(entries, now)).toMatchObject({ longestRun: 3, currentRun: 0 });
  });

  it('counts a run filling the whole window, first day included', () => {
    const entries = Array.from({ length: 40 }, (_, i) => fed(new Date(2026, 10, 11 - i).toISOString()));

    expect(fedDays(entries, now)).toMatchObject({ fedCount: 35, longestRun: 35, currentRun: 35 });
  });

  it('counts a run that starts before the window only from the window’s first day', () => {
    const entries = [5, 6, 7, 8].map((day) => fed(local(2026, 9, day)));

    expect(fedDays(entries, now).longestRun).toBe(1);
  });
});

describe('menu', () => {
  it('counts feedings, and how many came with each food, wet then dry then treats', () => {
    const { total, foods } = menu([
      fed(local(2026, 10, 10, 7), ['wet', 'treats']),
      fed(local(2026, 10, 10, 16), ['treats']),
      fed(local(2026, 10, 9, 7), []),
      seen(local(2026, 10, 9, 8)),
    ]);

    expect(total).toBe(3);
    expect(foods).toEqual([
      { food: 'wet', feedings: 1 },
      { food: 'dry', feedings: 0 },
      { food: 'treats', feedings: 2 },
    ]);
  });
});

describe('moodShare', () => {
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000);
  const fedAt = (hours: number) => fed(hoursAgo(hours).toISOString());

  it('is null with nothing logged', () => {
    expect(moodShare([], null, now)).toBeNull();
  });

  it('counts every feeding’s 12-hour window once, overlaps included, over the last days', () => {
    // Windows: 30–18 h ago, 20–8 h ago (overlapping by 2 h), 3 h ago to now (cut off by now): 12 + 10 + 3 = 25 h content of 48.
    const share = moodShare([fedAt(30), fedAt(20), fedAt(3)], hoursAgo(48), now);

    expect(share).toEqual({ content: 25, hungry: 23 });
  });

  it('lets a feeding from before the window reach into it', () => {
    // Fed 50 h ago: content until 38 h ago, so 10 of the 48 hours.
    expect(moodShare([fedAt(50)], hoursAgo(48), now)).toEqual({ content: 10, hungry: 38 });
  });

  it('ignores a feeding whose window ended before the span began', () => {
    // Fed 70 h ago: content until 58 h ago, all before the 48-hour span.
    expect(moodShare([fedAt(70)], hoursAgo(48), now)).toEqual({ content: 0, hungry: 48 });
  });

  it('ignores sightings and left-out feedings as feedings for the mood', () => {
    const share = moodShare([seen(hoursAgo(5).toISOString()), fed(hoursAgo(5).toISOString(), ['dry'], false)], hoursAgo(48), now);

    // A left-out feeding still fed him: 5 h content.
    expect(share).toEqual({ content: 5, hungry: 43 });
  });

  it('measures all time from the first entry when no range is given', () => {
    // First entry 40 h ago (a sighting), fed 10 h ago: 10 h content of 40.
    expect(moodShare([seen(hoursAgo(40).toISOString()), fedAt(10)], null, now)).toEqual({ content: 10, hungry: 30 });
  });
});
