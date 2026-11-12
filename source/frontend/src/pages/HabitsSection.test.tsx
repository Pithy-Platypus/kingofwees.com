import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Courtier, HabitEntry, Habits } from '../king/api';
import { fakeApi } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';
import { HabitsSection } from './HabitsSection';

// Local times: the charts bucket in the reader's own zone.
const now = new Date(2026, 10, 11, 12, 0); // Wednesday 11 November 2026, noon
const local = (month: number, day: number, hour = 9) => new Date(2026, month, day, hour).toISOString();
const fed = (occurredAt: string, foods: HabitEntry['foods'] = ['wet']): HabitEntry => ({ occurredAt, kind: 'fed', sawKing: true, foods });
const seen = (occurredAt: string): HabitEntry => ({ occurredAt, kind: 'seen', sawKing: true, foods: [] });

const leftOut = (occurredAt: string): HabitEntry => ({ occurredAt, kind: 'fed', sawKing: false, foods: ['dry'] });

const entries = [
  fed(local(10, 11, 7), ['wet', 'treats']),
  fed(local(10, 10, 16), ['treats']),
  fed(local(10, 9, 16), ['wet']),
  seen(local(10, 11, 16)),
  seen(local(10, 10, 21)),
  leftOut(local(10, 8, 6)),
];

const court: Courtier[] = [
  { name: 'Sunny', feedings: 18 },
  { name: 'Dev', feedings: 4 },
  { name: 'the Capps', feedings: 1 },
];

// The server's one answer: the same court for every range unless a test says otherwise.
const courts = (seats: Courtier[], week: Courtier[] = seats): Habits['courts'] => ({ 7: week, 30: seats, all: seats });

const render = (habits: HabitEntry[] = entries, seats: Courtier[] = court, range: 7 | 30 | 'all' = 'all') => {
  const api = fakeApi(undefined, { habits: { entries: habits, courts: courts(seats) } });
  renderInEnglish(<HabitsSection api={api} now={now} range={range} />);
  return api;
};

describe('HabitsSection', () => {
  it('shows the three charts under one heading once the entries arrive', async () => {
    const api = render();

    expect(screen.getByRole('status')).toHaveTextContent('Loading King’s habits…');
    expect(await screen.findByRole('img', { name: 'Feedings and times seen, by hour of the day' })).toBeInTheDocument();
    expect(api.getHabits).toHaveBeenCalledTimes(1); // one answer carries every range's court
    expect(screen.getByRole('region', { name: 'King’s habits' })).toBeInTheDocument();
    // The legend wears Home's map-key dots, so fed and seen look alike on both pages.
    const legend = screen.getByText('Feedings').closest('ul');
    expect(legend?.querySelector('.legend-dot.legend-dot-fed')).not.toBeNull();
    expect(legend?.querySelector('.legend-dot.legend-dot-seen')).not.toBeNull();
    expect(
      screen.getAllByRole('figure').map((f) => within(f).getByText(/King’s day|The royal calendar|The royal menu|Content or hungry|The royal court/).textContent),
    ).toEqual(['King’s day', 'The royal calendar', 'The royal menu', 'Content or hungry', 'The royal court']);
  });

  it('says so when nothing is logged', async () => {
    render([], []);

    expect(await screen.findByText('His habits will show here once something is logged.')).toBeInTheDocument();
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('lists the hours with something logged in words, and the hour with most meals', async () => {
    render();

    const hours = within(await screen.findByRole('list', { name: 'Hours with something logged' }));
    expect(hours.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '6 AM1 feeding',
      '7 AM1 feeding, seen once',
      '4 PM2 feedings, seen 3 times',
      '9 PMseen once',
    ]);
    expect(screen.getByText('Most meals around 4 PM.')).toBeInTheDocument();
  });

  it('names the earlier hour when two tie for most meals', async () => {
    render([fed(local(10, 11, 7)), fed(local(10, 10, 16))]);

    expect(await screen.findByText('Most meals around 7 AM.')).toBeInTheDocument();
  });

  it('draws one pair of bars per hour, the tallest reaching the top', async () => {
    render();

    const chart = await screen.findByRole('img', { name: 'Feedings and times seen, by hour of the day' });
    expect(chart.querySelectorAll('rect.habits-bar-fed')).toHaveLength(24);
    expect(chart.querySelectorAll('rect.habits-bar-seen')).toHaveLength(24);
    const heights = [...chart.querySelectorAll('rect.habits-bar-seen')].map((r) => Number(r.getAttribute('height')));
    expect(Math.max(...heights)).toBe(90);
    expect(heights[16]).toBe(90);
    expect(heights[7]).toBe(30);
    // Hour 16's pair sits in its own 10-unit slot, on the baseline, the seen bar right of the fed one.
    const fedBar = chart.querySelectorAll('rect.habits-bar-fed')[16];
    const seenBar = chart.querySelectorAll('rect.habits-bar-seen')[16];
    expect([fedBar!.getAttribute('x'), fedBar!.getAttribute('y'), fedBar!.getAttribute('height')]).toEqual(['161', '35', '60']);
    expect([seenBar!.getAttribute('x'), seenBar!.getAttribute('y')]).toEqual(['165.5', '5']);
    expect(chart.getAttribute('viewBox')).toBe('0 0 240 110');
    expect([...chart.querySelectorAll('text')].map((t) => [t.textContent, t.getAttribute('x')])).toEqual([
      ['12 AM', '1'],
      ['6 AM', '61'],
      ['12 PM', '121'],
      ['6 PM', '181'],
    ]);
  });

  it('crowns the fed days of the last 35, marks today, and sums the runs', async () => {
    render();

    const calendar = within(await screen.findByRole('list', { name: 'The last 35 days' }));
    const days = calendar.getAllByRole('listitem');
    expect(days).toHaveLength(35);
    expect(days[34]).toHaveClass('habits-day-fed', 'habits-day-today');
    expect(days[34]!.querySelector('svg')).not.toBeNull();
    expect(days[30]).not.toHaveClass('habits-day-fed');
    expect(days[33]).toHaveClass('habits-day-fed');
    expect(days[33]).not.toHaveClass('habits-day-today');
    expect(days[30]!.querySelector('svg')).toBeNull();
    expect(calendar.getByText('Wed, Nov 11: fed')).toBeInTheDocument();
    expect(calendar.getByText('Sat, Nov 7: not fed')).toBeInTheDocument();
    expect(calendar.getByText('Thu, Oct 8: not fed')).toBeInTheDocument();
    expect(screen.getByText('Fed on 4 of the last 35 days. Longest run: 4 days. On a run of 4 days.')).toBeInTheDocument();
  });

  it('shows each food with how many feedings it came with, as a bar sized to the share', async () => {
    render();

    const list = within(await screen.findByRole('list', { name: 'How often each food came with a feeding' }));
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Wet food2 of 4 feedings',
      'Dry food1 of 4 feedings',
      'Treats2 of 4 feedings',
    ]);
    const widths = [...list.getAllByRole('listitem')].map((li) => Number(li.querySelector('rect')?.getAttribute('width')));
    expect(widths).toEqual([50, 25, 50]);
  });

  it('says no feedings yet when only sightings exist, and skips the meals line', async () => {
    render([seen(local(10, 11, 16))]);

    expect(await screen.findByText('No feedings logged yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Most meals/)).toBeNull();
    expect(screen.getByText('Fed on 0 of the last 35 days. Longest run: 0 days. No run going right now.')).toBeInTheDocument();
  });

  it('seats the court in order with a crown on the first, and says so when nobody is named', async () => {
    render();

    const seats = within(await screen.findByRole('list', { name: 'Neighbors with most feedings' }));
    expect(screen.getByText('The neighbors who fed King most in this time.')).toBeInTheDocument();
    const items = seats.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Sunny18 feedings', 'Dev4 feedings', 'the Capps1 feeding']);
    expect(items[0]!.querySelector('svg')).not.toBeNull();
    expect(items[1]!.querySelector('svg')).toBeNull();
  });

  it('says no named feeders yet when the court is empty', async () => {
    render(entries, []);

    expect(await screen.findByText('No named feeders yet.')).toBeInTheDocument();
    expect(screen.getByText('The neighbors who fed King most in this time.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Neighbors with most feedings' })).toBeNull();
  });

  it('follows the range for the hours, menu, mood and court, out of the one answer, but keeps the calendar’s five weeks', async () => {
    const old = fed(new Date(2026, 9, 20, 10).toISOString(), ['dry']);
    const api = fakeApi(undefined, { habits: { entries: [...entries, old], courts: courts(court, [{ name: 'Dev', feedings: 2 }]) } });
    renderInEnglish(<HabitsSection api={api} now={now} range={7} />);

    const hours = within(await screen.findByRole('list', { name: 'Hours with something logged' }));
    expect(api.getHabits).toHaveBeenCalledTimes(1);
    expect(hours.queryByText('10 AM')).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Neighbors with most feedings' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Dev2 feedings',
    ]);
    const menuRows = () => within(screen.getByRole('list', { name: 'How often each food came with a feeding' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(menuRows()).toContain('Dry food1 of 4 feedings');
    expect(within(screen.getByRole('list', { name: 'The last 35 days' })).getAllByRole('listitem')).toHaveLength(35);
  });

  it('includes an older entry when the range is all time', async () => {
    const old = fed(new Date(2026, 9, 20, 10).toISOString(), ['dry']);
    render([...entries, old], court, 'all');

    const hours = within(await screen.findByRole('list', { name: 'Hours with something logged' }));
    expect(hours.getByText('10 AM')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'How often each food came with a feeding' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toContain('Dry food2 of 5 feedings');
  });

  it('re-sums and reseats the court when the range changes, without asking the server again', async () => {
    const old = fed(new Date(2026, 9, 20, 10).toISOString(), ['dry']);
    const api = fakeApi(undefined, { habits: { entries: [...entries, old], courts: courts(court, [{ name: 'Dev', feedings: 2 }]) } });
    const { rerender } = renderInEnglish(<HabitsSection api={api} now={now} range={7} />);
    await screen.findByRole('list', { name: 'Hours with something logged' });
    expect(screen.queryByText('10 AM')).toBeNull();
    expect(screen.queryByText('Sunny')).toBeNull();

    rerender(<HabitsSection api={api} now={now} range="all" />);

    expect(await screen.findByText('10 AM')).toBeInTheDocument();
    expect(screen.getByText('Sunny')).toBeInTheDocument();
    expect(api.getHabits).toHaveBeenCalledTimes(1);
  });

  it('shows how much of the time King was content, as a bar and a sentence', async () => {
    render();

    // All time from the first entry (Nov 8, 6 am) to noon Nov 11 is 78 h; four feedings cover 12 + 12 + 12 + 5 h = 41 h.
    expect(
      await screen.findByText('His Majesty was content 53% of the time — fed within the last 12 hours — and awaiting a feast the rest.'),
    ).toBeInTheDocument();
    const bar = screen.getByText('Content or hungry').closest('figure')?.querySelector('svg.habits-mood-bar');
    expect(Math.round(Number(bar?.querySelector('rect.habits-mood-content')?.getAttribute('width')))).toBe(53);
  });

  it('offers Try again when the load fails, and loads again', async () => {
    const api = fakeApi();
    api.getHabits.mockRejectedValueOnce(new Error('down'));
    renderInEnglish(<HabitsSection api={api} now={now} range="all" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load King’s habits.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(api.getHabits).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('His habits will show here once something is logged.')).toBeInTheDocument();
  });
});
