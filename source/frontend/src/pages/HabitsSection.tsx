import { useCallback, type ReactNode } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import type { Habits, HeatRange, kingApi } from '../king/api';
import { byHour, CALENDAR_DAYS, fedDays, menu, moodShare, type HourCount } from '../king/habits';
import { CrownIcon } from '../king/icons';
import { foodMessage } from '../king/messages';
import { CONTENT_HOURS } from '../king/time';
import { useLoad } from '../king/useLoad';
import { LoadState } from './LoadState';

type Values = {
  heading: NoMessageValues;
  loading: NoMessageValues;
  failed: NoMessageValues;
  empty: NoMessageValues;
  day: NoMessageValues;
  dayChart: NoMessageValues;
  legendFed: NoMessageValues;
  legendSeen: NoMessageValues;
  hours: NoMessageValues;
  hourFed: { count: number };
  hourSeen: { count: number };
  busiest: { hour: string };
  calendar: NoMessageValues;
  calendarDays: { count: number };
  fedDay: { date: string };
  unfedDay: { date: string };
  fedCount: { fed: number; days: number };
  longestRun: { count: number };
  currentRun: { count: number };
  menu: NoMessageValues;
  menuList: NoMessageValues;
  menuCount: { feedings: number; total: number };
  menuEmpty: NoMessageValues;
  court: NoMessageValues;
  courtBlurb: NoMessageValues;
  courtList: NoMessageValues;
  courtFeedings: { count: number };
  courtEmpty: NoMessageValues;
  mood: NoMessageValues;
  moodShare: { content: string; hours: number };
};

const m = defineMessages<Values>({
  heading: { id: 'habits.heading', defaultMessage: 'King’s habits', description: 'Heading over the charts on the history page' },
  loading: { id: 'habits.loading', defaultMessage: 'Loading King’s habits…', description: 'Shown while the charts load' },
  failed: { id: 'habits.failed', defaultMessage: 'Couldn’t load King’s habits.', description: 'Shown when the charts cannot be loaded' },
  empty: { id: 'habits.empty', defaultMessage: 'His habits will show here once something is logged.', description: 'Charts section when no entry exists' },
  day: { id: 'habits.day', defaultMessage: 'King’s day', description: 'Caption of the chart of feedings and sightings by hour' },
  dayChart: {
    id: 'habits.dayChart',
    defaultMessage: 'Feedings and times seen, by hour of the day',
    description: 'Accessible name of the by-hour bar chart',
  },
  legendFed: { id: 'habits.legendFed', defaultMessage: 'Feedings', description: 'Legend of the by-hour chart: the feedings bars' },
  legendSeen: { id: 'habits.legendSeen', defaultMessage: 'Seen', description: 'Legend of the by-hour chart: the bars of times King was seen' },
  hours: { id: 'habits.hours', defaultMessage: 'Hours with something logged', description: 'Accessible name of the list under the by-hour chart' },
  hourFed: {
    id: 'habits.hourFed',
    defaultMessage: '{count, plural, one {# feeding} other {# feedings}}',
    description: 'Feedings in one hour of the day, in the list under the chart',
  },
  hourSeen: {
    id: 'habits.hourSeen',
    defaultMessage: '{count, plural, one {seen once} other {seen # times}}',
    description: 'Times King was seen in one hour of the day, in the list under the chart',
  },
  busiest: {
    id: 'habits.busiest',
    defaultMessage: 'Most meals around {hour}.',
    description: 'Line under the by-hour chart; {hour} is e.g. “4 PM”',
  },
  calendar: { id: 'habits.calendar', defaultMessage: 'The royal calendar', description: 'Caption of the grid of the last five weeks, a crown on each fed day' },
  calendarDays: {
    id: 'habits.calendarDays',
    defaultMessage: 'The last {count} days',
    description: 'Accessible name of the calendar grid; {count} is 35',
  },
  fedDay: { id: 'habits.fedDay', defaultMessage: '{date}: fed', description: 'Accessible text of a calendar day King was fed on; {date} is e.g. “Wed, Nov 11”' },
  unfedDay: { id: 'habits.unfedDay', defaultMessage: '{date}: not fed', description: 'Accessible text of a calendar day with no feeding; {date} is e.g. “Wed, Nov 11”' },
  fedCount: {
    id: 'habits.fedCount',
    defaultMessage: 'Fed on {fed} of the last {days} days.',
    description: 'Sentence over the calendar; {days} is 35',
  },
  longestRun: {
    id: 'habits.longestRun',
    defaultMessage: '{count, plural, one {Longest run: # day.} other {Longest run: # days.}}',
    description: 'Sentence over the calendar: the most days in a row with a feeding',
  },
  currentRun: {
    id: 'habits.currentRun',
    defaultMessage: '{count, plural, =0 {No run going right now.} one {On a run of # day.} other {On a run of # days.}}',
    description: 'Sentence over the calendar: days in a row with a feeding up to today (or yesterday, before today’s first meal)',
  },
  menu: { id: 'habits.menu', defaultMessage: 'The royal menu', description: 'Caption of the chart of how often each food came with a feeding' },
  menuList: {
    id: 'habits.menuList',
    defaultMessage: 'How often each food came with a feeding',
    description: 'Accessible name of the list of foods with their bars',
  },
  menuCount: {
    id: 'habits.menuCount',
    defaultMessage: '{feedings} of {total, plural, one {# feeding} other {# feedings}}',
    description: 'Beside a food’s bar: with how many of all feedings it came',
  },
  menuEmpty: { id: 'habits.menuEmpty', defaultMessage: 'No feedings logged yet.', description: 'Menu chart when only sightings exist' },
  court: { id: 'habits.court', defaultMessage: 'The royal court', description: 'Caption of the list of the three neighbors with most feedings' },
  courtBlurb: { id: 'habits.courtBlurb', defaultMessage: 'The neighbors who fed King most in this time.', description: 'Line under the court caption saying what the list is' },
  courtList: { id: 'habits.courtList', defaultMessage: 'Neighbors with most feedings', description: 'Accessible name of the court list' },
  courtFeedings: {
    id: 'habits.courtFeedings',
    defaultMessage: '{count, plural, one {# feeding} other {# feedings}}',
    description: 'Beside a courtier’s name: how many feedings they logged',
  },
  courtEmpty: { id: 'habits.courtEmpty', defaultMessage: 'No named feeders yet.', description: 'Court when no feeding carries a nickname' },
  mood: { id: 'habits.mood', defaultMessage: 'Content or hungry', description: 'Caption of the bar showing how much of the time King counted as content' },
  moodShare: {
    id: 'habits.moodShare',
    defaultMessage: 'His Majesty was content {content} of the time — fed within the last {hours} hours — and awaiting a feast the rest.',
    description: 'Sentence under the content-or-hungry bar; {content} is a percentage like “41%”, {hours} the threshold (12)',
  },
});

// Fixed drawing units; the browser scales the whole picture to the column.
const HOUR_WIDTH = 10;
const BAR_WIDTH = 3.5;
const CHART_HEIGHT = 90;
const BASELINE = 95;
const LABEL_HOURS = [0, 6, 12, 18];

type Props = { api: Pick<typeof kingApi, 'getHabits'>; now: Date; range: HeatRange };

export function HabitsSection({ api, now, range }: Props) {
  const getHabits = useCallback(() => api.getHabits(range), [api, range]);
  const { data: habits, failed, retry } = useLoad(getHabits);

  return (
    <Section>
      <LoadState data={habits} failed={failed} onRetry={retry} messages={m} isEmpty={(loaded) => loaded.entries.length === 0}>
        {(loaded) => <Charts habits={loaded} now={now} range={range} />}
      </LoadState>
    </Section>
  );
}

/** The five figures, once something is logged. */
function Charts({ habits, now, range }: { habits: Habits; now: Date; range: HeatRange }) {
  const intl = useIntl();
  const hourName = (hour: number) => intl.formatTime(new Date(2000, 0, 1, hour), { hour: 'numeric' });
  const dayName = (date: Date) => intl.formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });

  // The calendar always shows its five weeks; everything else follows the range. At most 5,000 entries: no memo needed.
  const since = range === 'all' ? null : new Date(now.getTime() - range * 24 * 3600 * 1000);
  const entries = habits.entries.filter((e) => since === null || new Date(e.occurredAt) >= since);
  const hours = byHour(entries);
  const calendar = fedDays(habits.entries, now);
  const royalMenu = menu(entries);
  const mood = moodShare(entries, since, now);

  const max = Math.max(1, ...hours.map((h) => Math.max(h.fed, h.seen)));
  const height = (count: number) => (count / max) * CHART_HEIGHT;
  const busyHours = hours.map((h, hour) => ({ ...h, hour })).filter((h) => h.fed > 0 || h.seen > 0);
  const mostMeals = hours.reduce((best, h, hour) => (h.fed > best.fed ? { hour, fed: h.fed } : best), { hour: 0, fed: 0 }).hour;
  const today = calendar.days.length - 1;

  return (
    <>
      <figure className="habits-figure">
        <figcaption className="section-subtitle">
          <FormattedMessage {...m.day} />
        </figcaption>
        <svg viewBox={`0 0 ${24 * HOUR_WIDTH} 110`} className="habits-day-chart" role="img" aria-label={intl.formatMessage(m.dayChart)}>
          {hours.map((h: HourCount, hour) => (
            <g key={hour}>
              <rect className="habits-bar-fed" x={hour * HOUR_WIDTH + 1} y={BASELINE - height(h.fed)} width={BAR_WIDTH} height={height(h.fed)} />
              <rect
                className="habits-bar-seen"
                x={hour * HOUR_WIDTH + 1 + BAR_WIDTH + 1}
                y={BASELINE - height(h.seen)}
                width={BAR_WIDTH}
                height={height(h.seen)}
              />
            </g>
          ))}
          <line className="habits-axis" x1={0} y1={BASELINE} x2={24 * HOUR_WIDTH} y2={BASELINE} />
          {LABEL_HOURS.map((hour) => (
            <text key={hour} className="habits-axis-label" x={hour * HOUR_WIDTH + 1} y={107}>
              {hourName(hour)}
            </text>
          ))}
        </svg>
        <ul className="habits-legend">
          <li className="map-key-item">
            <span aria-hidden className="legend-dot legend-dot-fed" />
            <FormattedMessage {...m.legendFed} />
          </li>
          <li className="map-key-item">
            <span aria-hidden className="legend-dot legend-dot-seen" />
            <FormattedMessage {...m.legendSeen} />
          </li>
        </ul>
        {royalMenu.total > 0 && (
          <p className="habits-summary">
            <FormattedMessage {...m.busiest} values={{ hour: hourName(mostMeals) }} />
          </p>
        )}
        <ol className="stat-list" aria-label={intl.formatMessage(m.hours)}>
          {busyHours.map((h) => (
            <li key={h.hour} className="stat-row">
              <span className="stat-name">{hourName(h.hour)}</span>
              <span className="stat-count">
                {h.fed > 0 && <FormattedMessage {...m.hourFed} values={{ count: h.fed }} />}
                {h.fed > 0 && h.seen > 0 && ', '}
                {h.seen > 0 && <FormattedMessage {...m.hourSeen} values={{ count: h.seen }} />}
              </span>
            </li>
          ))}
        </ol>
      </figure>

      <figure className="habits-figure">
        <figcaption className="section-subtitle">
          <FormattedMessage {...m.calendar} />
        </figcaption>
        <p className="habits-summary">
          <FormattedMessage {...m.fedCount} values={{ fed: calendar.fedCount, days: CALENDAR_DAYS }} />{' '}
          <FormattedMessage {...m.longestRun} values={{ count: calendar.longestRun }} />{' '}
          <FormattedMessage {...m.currentRun} values={{ count: calendar.currentRun }} />
        </p>
        <ol className="habits-calendar" aria-label={intl.formatMessage(m.calendarDays, { count: CALENDAR_DAYS })}>
          {calendar.days.map((day, i) => (
            <li
              key={day.date.getTime()}
              className={['habits-day', day.fed ? 'habits-day-fed' : '', i === today ? 'habits-day-today' : ''].filter(Boolean).join(' ')}
            >
              <span className="habits-day-name">
                <FormattedMessage {...(day.fed ? m.fedDay : m.unfedDay)} values={{ date: dayName(day.date) }} />
              </span>
              <span aria-hidden className="habits-day-number">
                {intl.formatNumber(day.date.getDate())}
              </span>
              {day.fed && <CrownIcon className="habits-crown" />}
            </li>
          ))}
        </ol>
      </figure>

      <figure className="habits-figure">
        <figcaption className="section-subtitle">
          <FormattedMessage {...m.menu} />
        </figcaption>
        {royalMenu.total === 0 ? (
          <p className="activity-detail">
            <FormattedMessage {...m.menuEmpty} />
          </p>
        ) : (
          <ol className="habits-menu" aria-label={intl.formatMessage(m.menuList)}>
            {royalMenu.foods.map(({ food, feedings }) => (
              <li key={food} className="habits-menu-row">
                <span className="stat-name">
                  <FormattedMessage {...foodMessage(food)} />
                </span>
                <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="habits-menu-bar" aria-hidden focusable={false}>
                  <rect className="habits-bar-fed" x={0} y={0} width={(feedings / royalMenu.total) * 100} height={8} />
                </svg>
                <span className="habits-menu-count">
                  <FormattedMessage {...m.menuCount} values={{ feedings, total: royalMenu.total }} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </figure>

      {mood && mood.content + mood.hungry > 0 && (
        <figure className="habits-figure">
          <figcaption className="section-subtitle">
            <FormattedMessage {...m.mood} />
          </figcaption>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="habits-mood-bar" aria-hidden focusable={false}>
            <rect className="habits-mood-hungry" x={0} y={0} width={100} height={10} />
            <rect className="habits-mood-content" x={0} y={0} width={(mood.content / (mood.content + mood.hungry)) * 100} height={10} />
          </svg>
          <p className="habits-summary">
            <FormattedMessage
              {...m.moodShare}
              values={{
                content: intl.formatNumber(mood.content / (mood.content + mood.hungry), { style: 'percent', maximumFractionDigits: 0 }),
                hours: CONTENT_HOURS,
              }}
            />
          </p>
        </figure>
      )}

      <figure className="habits-figure">
        <figcaption className="section-subtitle">
          <FormattedMessage {...m.court} />
        </figcaption>
        <p className="habits-summary">
          <FormattedMessage {...m.courtBlurb} />
        </p>
        {habits.court.length === 0 ? (
          <p className="activity-detail">
            <FormattedMessage {...m.courtEmpty} />
          </p>
        ) : (
          <ol className="stat-list" aria-label={intl.formatMessage(m.courtList)}>
            {habits.court.map((c, i) => (
              <li key={c.name} className="habits-courtier">
                {i === 0 && <CrownIcon className="habits-courtier-crown" />}
                <span className="habits-courtier-name">{c.name}</span>
                <span className="stat-count">
                  <FormattedMessage {...m.courtFeedings} values={{ count: c.feedings }} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </figure>
    </>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="habits-heading" className="habits-section">
      <h2 id="habits-heading" className="section-title">
        <FormattedMessage {...m.heading} />
      </h2>
      {children}
    </section>
  );
}
