import type { Food, HabitEntry } from './api';

export type HourCount = { fed: number; seen: number };
export type FedDay = { date: Date; fed: boolean };
export type FedDays = { days: FedDay[]; fedCount: number; longestRun: number; currentRun: number };
export type MenuCount = { food: Food; feedings: number };
export type Menu = { total: number; foods: MenuCount[] };
/** Hours King was content (within CONTENT_HOURS of a feeding) and hours he wasn't, over a span. */
export type MoodShare = { content: number; hungry: number };

/** The royal calendar shows this many days, ending today. */
export const CALENDAR_DAYS = 35;

const FOODS: Food[] = ['wet', 'dry', 'treats'];

/** Home's threshold: content for this long after a feeding (`kingMood` in time.ts). */
export const CONTENT_HOURS = 12;
const HOUR = 3600 * 1000;

// Hours and days are the reader's own, as in the log; the server holds UTC and knows no zone.

/** Feedings and times King was seen (a feeding counts unless the food was left out) per local hour, 0–23. */
export function byHour(entries: HabitEntry[]): HourCount[] {
  const hours = Array.from({ length: 24 }, (): HourCount => ({ fed: 0, seen: 0 }));
  for (const e of entries) {
    const hour = hours[new Date(e.occurredAt).getHours()];
    if (e.kind === 'fed') hour.fed++;
    if (e.sawKing) hour.seen++;
  }
  return hours;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** The last CALENDAR_DAYS local days ending today, oldest first, with whether King was fed on each, and the runs. */
export function fedDays(entries: HabitEntry[], now: Date): FedDays {
  const fedKeys = new Set(entries.filter((e) => e.kind === 'fed').map((e) => dayKey(new Date(e.occurredAt))));
  const days: FedDay[] = [];
  for (let back = CALENDAR_DAYS - 1; back >= 0; back--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    days.push({ date, fed: fedKeys.has(dayKey(date)) });
  }

  let longestRun = 0;
  let run = 0;
  for (const day of days) {
    run = day.fed ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }

  // Before today's first meal the run isn't broken yet: it then counts back from yesterday.
  let end = days.length - 1;
  if (!days[end].fed) end--;
  let currentRun = 0;
  while (end >= 0 && days[end].fed) {
    currentRun++;
    end--;
  }

  return { days, fedCount: days.filter((d) => d.fed).length, longestRun, currentRun };
}

/** How many feedings there were, and how many came with each food (a feeding can carry several). */
export function menu(entries: HabitEntry[]): Menu {
  const feedings = entries.filter((e) => e.kind === 'fed');
  return {
    total: feedings.length,
    foods: FOODS.map((food) => ({ food, feedings: feedings.filter((e) => e.foods.includes(food)).length })),
  };
}

/**
 * How much of the span from `since` (null = the first entry) to `now` King was content: the union of every feeding's
 * CONTENT_HOURS window, clipped to the span, in hours. Null when nothing is logged.
 */
export function moodShare(entries: HabitEntry[], since: Date | null, now: Date): MoodShare | null {
  if (entries.length === 0) return null;
  const times = entries.map((e) => new Date(e.occurredAt).getTime());
  const start = since?.getTime() ?? Math.min(...times);
  const end = now.getTime();
  const feedings = entries
    .filter((e) => e.kind === 'fed')
    .map((e) => new Date(e.occurredAt).getTime())
    .sort((a, b) => a - b);

  let content = 0;
  let coveredTo = start;
  for (const fedAt of feedings) {
    const from = Math.max(fedAt, coveredTo);
    const to = Math.min(fedAt + CONTENT_HOURS * HOUR, end);
    if (to > from) content += to - from;
    coveredTo = Math.max(coveredTo, to);
  }
  const span = Math.max(0, end - start);
  return { content: content / HOUR, hungry: (span - content) / HOUR };
}
