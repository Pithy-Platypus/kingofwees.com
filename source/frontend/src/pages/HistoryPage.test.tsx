import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HeatCell, HistoryPage as HistoryPageData } from '../king/api';
import { ADMIN_KEY, CENTER, device, event, fakeAdminApi, fakeApi, NOW, spot } from '../test/fakeApi';
import { ApiError } from '../king/api';
import { renderInEnglish } from '../test/render';
import { HistoryPage } from './HistoryPage';

const porch = spot('porch', 'Porch');
const cell = (latitude: number, count: number, spotName: string | null = null): HeatCell => ({
  location: { latitude, longitude: CENTER.longitude },
  count,
  spotName,
});

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
const places = () => within(screen.getByRole('list', { name: 'Places, busiest first' }));

describe('HistoryPage — heat map', () => {
  it('opens on where he’s seen over the last 30 days', async () => {
    const api = fakeApi();
    renderInEnglish(<HistoryPage api={api} spots={[]} mapCenter={null} now={NOW} />);

    await waitFor(() => expect(api.getHeat).toHaveBeenCalledWith('seen', 30));
    expect(pressed('Where he’s seen')).toBe('true');
    expect(pressed('Where he’s fed')).toBe('false');
    expect(pressed('30 days')).toBe('true');
    expect(pressed('7 days')).toBe('false');
    expect(pressed('All')).toBe('false');
    // The choice shows as a check mark too, not by color alone.
    expect(screen.getByRole('button', { name: 'Where he’s seen' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Where he’s fed' }).querySelector('svg')).toBeNull();
  });

  it('lists each place in words, busiest first, named after the feeding spots', async () => {
    const heat = [cell(CENTER.latitude, 3), cell(CENTER.latitude + 0.003, 1)];
    renderInEnglish(<HistoryPage api={fakeApi(undefined, { heat })} spots={[porch]} mapCenter={null} now={NOW} />);

    const items = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
    expect(items).toEqual(['Near Porch3 sightings', 'About 1,100 ft from Porch1 sighting']);
  });

  it('shows the blocks around one spot as one place, on the list and the map', async () => {
    const heat = [cell(CENTER.latitude + 0.001, 2), cell(CENTER.latitude + 0.007, 2), cell(CENTER.latitude, 1)];
    renderInEnglish(<HistoryPage api={fakeApi(undefined, { heat })} spots={[porch]} mapCenter={CENTER} now={NOW} />);

    await screen.findAllByRole('listitem');
    expect(places().getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Near Porch3 sightings',
      'About 0.5 mi from Porch2 sightings',
    ]);
    const map = screen.getByRole('region', { name: 'Map of where King is seen' });
    await waitFor(() => expect(map.querySelectorAll('.map-marker-heat')).toHaveLength(2));
  });

  it('names fed cells after their spot and counts feedings', async () => {
    const api = fakeApi(undefined, { heat: [cell(CENTER.latitude, 2, 'Steps')] });
    renderInEnglish(<HistoryPage api={api} spots={[]} mapCenter={null} now={NOW} />);
    await screen.findByRole('listitem');
    api.getHeat.mockResolvedValue([cell(CENTER.latitude, 1, 'Steps')]);

    await userEvent.click(screen.getByRole('button', { name: 'Where he’s fed' }));

    expect(api.getHeat).toHaveBeenLastCalledWith('fed', 30);
    expect(pressed('Where he’s fed')).toBe('true');
    expect(await places().findByText('1 feeding')).toBeInTheDocument();
    expect(places().getByText('Steps')).toBeInTheDocument();
  });

  it('switches the time range', async () => {
    const api = fakeApi();
    renderInEnglish(<HistoryPage api={api} spots={[]} mapCenter={null} now={NOW} />);

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(api.getHeat).toHaveBeenLastCalledWith('seen', 'all');
    expect(pressed('All')).toBe('true');

    await userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(api.getHeat).toHaveBeenLastCalledWith('seen', 7);
  });

  it('says where nothing lies when there are no spots', async () => {
    renderInEnglish(<HistoryPage api={fakeApi(undefined, { heat: [cell(CENTER.latitude, 1)] })} spots={[]} mapCenter={null} now={NOW} />);

    await screen.findByRole('listitem');
    expect(places().getByText('Somewhere without a spot nearby')).toBeInTheDocument();
  });

  it('says so when nothing with a place was logged in that time', async () => {
    renderInEnglish(<HistoryPage api={fakeApi()} spots={[]} mapCenter={null} now={NOW} />);

    expect(await screen.findByText('Nothing with a place logged in this time.')).toBeInTheDocument();
  });

  it('draws one circle per place on the map, the busiest at the top level', async () => {
    const heat = [cell(CENTER.latitude, 4), cell(CENTER.latitude + 0.001, 1)];
    renderInEnglish(<HistoryPage api={fakeApi(undefined, { heat })} spots={[]} mapCenter={CENTER} now={NOW} />);

    const map = screen.getByRole('region', { name: 'Map of where King is seen' });
    await waitFor(() => expect(map.querySelectorAll('.map-marker-heat')).toHaveLength(2));
    expect(map.querySelectorAll('.map-heat-4')).toHaveLength(1);
    expect(map.querySelectorAll('.map-heat-1')).toHaveLength(1);
  });

  it('shows the list without a map when the site has none', async () => {
    renderInEnglish(<HistoryPage api={fakeApi(undefined, { heat: [cell(CENTER.latitude, 1)] })} spots={[]} mapCenter={null} now={NOW} />);

    await screen.findByRole('listitem');
    expect(screen.queryByRole('region', { name: /^Map of/ })).not.toBeInTheDocument();
  });

  it('shows only the latest choice when an earlier answer arrives late', async () => {
    const api = fakeApi();
    let answerSeen: (cells: HeatCell[]) => void = () => {};
    api.getHeat.mockImplementationOnce(() => new Promise((resolve) => (answerSeen = resolve)));
    api.getHeat.mockResolvedValueOnce([cell(CENTER.latitude, 2, 'Steps')]);
    renderInEnglish(<HistoryPage api={api} spots={[]} mapCenter={null} now={NOW} />);

    await userEvent.click(screen.getByRole('button', { name: 'Where he’s fed' }));
    expect(await places().findByText('2 feedings')).toBeInTheDocument();
    answerSeen([cell(CENTER.latitude, 9)]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(places().getByText('2 feedings')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('says so when the heat map can’t be loaded, and can try again', async () => {
    const api = fakeApi();
    api.getHeat.mockRejectedValueOnce(new Error('offline'));
    renderInEnglish(<HistoryPage api={api} spots={[]} mapCenter={null} now={NOW} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the heat map.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Nothing with a place logged in this time.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('HistoryPage — every entry', () => {
  // Local times, so day boundaries hold in any time zone the tests run in.
  const local = (year: number, month: number, day: number, hour: number, minute = 0) => new Date(year, month - 1, day, hour, minute);
  const now = local(2026, 10, 8, 18);
  const entry = (id: string, when: Date, overrides: Parameters<typeof event>[0] = {}) =>
    event({ id, occurredAt: when.toISOString(), ...overrides });
  const renderLog = (api: ReturnType<typeof fakeApi>) =>
    renderInEnglish(<HistoryPage api={api} spots={[porch]} mapCenter={null} now={now} />);
  const day = (name: string) => within(screen.getByRole('list', { name }));

  it('groups every entry by day, newest first, each with its time', async () => {
    const events = [
      entry('a', local(2026, 10, 8, 15, 30), { kind: 'fed', reporterName: 'Sarah', foods: ['wet'], spotName: 'Porch' }),
      entry('b', local(2026, 10, 8, 9, 5), { kind: 'seen', location: porch.location }),
      entry('c', local(2026, 10, 7, 20), { kind: 'seen' }),
      entry('d', local(2026, 10, 5, 7), { kind: 'fed' }),
      entry('e', local(2025, 12, 31, 7), { kind: 'fed' }),
    ];
    renderLog(fakeApi(undefined, { history: { events, next: null } }));

    const days = (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);
    expect(days).toEqual(['Today', 'Yesterday', 'Monday, October 5', 'Wednesday, December 31, 2025']);
    expect(day('Today').getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Fed by SarahWet food · at Porch3:30 PM',
      'Seen by a neighbornear Porch9:05 AM',
    ]);
    expect(day('Yesterday').getAllByRole('listitem')).toHaveLength(1);
  });

  it('says when food was only left out', async () => {
    const events = [entry('a', local(2026, 10, 8, 15), { kind: 'fed', foods: ['dry'], sawKing: false, spotName: 'Porch' })];
    renderLog(fakeApi(undefined, { history: { events, next: null } }));

    expect(await screen.findByText('Dry food · at Porch · left food out')).toBeInTheDocument();
  });

  it('shows older entries on request, after the last one shown, and moves focus to the first of them', async () => {
    const api = fakeApi(undefined, { history: { events: [entry('a', local(2026, 10, 8, 15))], next: 'a' } });
    api.getHistory.mockResolvedValueOnce({ events: [entry('a', local(2026, 10, 8, 15))], next: 'a' });
    api.getHistory.mockResolvedValueOnce({ events: [entry('b', local(2026, 10, 8, 9)), entry('c', local(2026, 10, 5, 7))], next: null });
    renderLog(api);

    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));

    expect(api.getHistory).toHaveBeenLastCalledWith('a');
    await waitFor(() => expect(day('Today').getAllByRole('listitem')).toHaveLength(2));
    expect(day('Today').getAllByRole('listitem')[1]).toHaveFocus();
    expect(day('Monday, October 5').getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument();
  });

  it('offers nothing older when the first page is everything', async () => {
    renderLog(fakeApi(undefined, { history: { events: [entry('a', local(2026, 10, 8, 15))], next: null } }));

    await screen.findByRole('heading', { level: 3, name: 'Today' });
    expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument();
  });

  it('says so when nothing has been logged', async () => {
    renderLog(fakeApi());

    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
  });

  it('says so when the history can’t be loaded, and can try again', async () => {
    const api = fakeApi(undefined, { history: { events: [entry('a', local(2026, 10, 8, 15))], next: null } });
    api.getHistory.mockRejectedValueOnce(new Error('offline'));
    renderLog(api);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load King’s history.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Today' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps what is shown when older entries can’t be loaded, and can try again', async () => {
    const api = fakeApi();
    api.getHistory.mockResolvedValueOnce({ events: [entry('a', local(2026, 10, 8, 15))], next: 'a' });
    api.getHistory.mockRejectedValueOnce(new Error('offline'));
    api.getHistory.mockResolvedValueOnce({ events: [entry('b', local(2026, 10, 8, 9))], next: null });
    renderLog(api);

    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load older entries.');
    expect(day('Today').getAllByRole('listitem')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Show older' }));
    await waitFor(() => expect(day('Today').getAllByRole('listitem')).toHaveLength(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a second tap on Show older while the first is loading', async () => {
    const api = fakeApi();
    let answerOlder: (page: HistoryPageData) => void = () => {};
    api.getHistory.mockResolvedValueOnce({ events: [entry('a', local(2026, 10, 8, 15))], next: 'a' });
    api.getHistory.mockImplementationOnce(() => new Promise((resolve) => (answerOlder = resolve)));
    renderLog(api);
    const older = await screen.findByRole('button', { name: 'Show older' });

    await userEvent.dblClick(older);
    answerOlder({ events: [entry('b', local(2026, 10, 8, 9))], next: null });

    await waitFor(() => expect(day('Today').getAllByRole('listitem')).toHaveLength(2));
    expect(api.getHistory).toHaveBeenCalledTimes(2);
  });
});

describe('HistoryPage — hiding, for admins', () => {
  const history = { events: [event({ id: 'e1', reporterName: 'Sarah' }), event({ id: 'e2', kind: 'seen' })], next: null };
  const renderAsAdmin = (adminApi = fakeAdminApi(), api = fakeApi(undefined, { history })) => {
    const onRejected = vi.fn();
    renderInEnglish(
      <HistoryPage api={api} spots={[]} mapCenter={null} now={NOW} admin={{ key: ADMIN_KEY, api: adminApi, onRejected }} />,
    );
    return { api, adminApi, onRejected };
  };
  const firstEntry = async () => within((await screen.findAllByRole('listitem'))[0]);

  it('offers nothing to visitors', async () => {
    renderInEnglish(<HistoryPage api={fakeApi(undefined, { history })} spots={[]} mapCenter={null} now={NOW} />);

    await screen.findByText('Fed by Sarah');
    expect(screen.queryByRole('button', { name: /^Hide/ })).not.toBeInTheDocument();
  });

  it('hides one entry after asking, then shows the log without it', async () => {
    const { api, adminApi } = renderAsAdmin();
    await userEvent.click((await firstEntry()).getByRole('button', { name: 'Hide this entry' }));

    expect(screen.getByText('Hide this entry from everyone?')).toHaveFocus();
    expect(adminApi.hideEntry).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Hide it' }));

    expect(adminApi.hideEntry).toHaveBeenCalledWith(ADMIN_KEY, 'e1');
    await waitFor(() => expect(api.getHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/^Hidden\. You can restore it on the/)).toHaveFocus();
    expect(screen.getByRole('link', { name: 'admin page' })).toHaveAttribute('href', '/admin');
  });

  it('cancels without hiding and puts focus back', async () => {
    const { adminApi } = renderAsAdmin();
    await userEvent.click((await firstEntry()).getByRole('button', { name: 'Hide this entry' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(adminApi.hideEntry).not.toHaveBeenCalled();
    expect((await firstEntry()).getByRole('button', { name: 'Hide this entry' })).toHaveFocus();
  });

  it('says how much a poster’s hiding covers before hiding it all', async () => {
    const adminApi = fakeAdminApi({ device: device({ entries: 14, spots: 2, reporterName: 'Sarah' }) });
    const { api } = renderAsAdmin(adminApi);
    await userEvent.click((await firstEntry()).getByRole('button', { name: 'Hide everything from this poster' }));

    expect(adminApi.describeDevice).toHaveBeenCalledWith(ADMIN_KEY, 'e1');
    expect(await screen.findByText('Hide 14 entries and 2 spots from Sarah, including anything they post later?')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Hide all' }));

    expect(adminApi.hideDevice).toHaveBeenCalledWith(ADMIN_KEY, 'e1');
    await waitFor(() => expect(api.getHistory).toHaveBeenCalledTimes(2));
  });

  it('names an unnamed poster and counts one entry and no spots', async () => {
    renderAsAdmin(fakeAdminApi({ device: device({ entries: 1, spots: 0, reporterName: null }) }));
    await userEvent.click((await firstEntry()).getByRole('button', { name: 'Hide everything from this poster' }));

    expect(await screen.findByText('Hide 1 entry and no spots from a neighbor, including anything they post later?')).toBeInTheDocument();
  });

  it('says so when hiding fails, keeping the entry', async () => {
    const adminApi = fakeAdminApi();
    adminApi.hideEntry.mockRejectedValue(new TypeError('offline'));
    const { api } = renderAsAdmin(adminApi);
    await userEvent.click((await firstEntry()).getByRole('button', { name: 'Hide this entry' }));

    await userEvent.click(screen.getByRole('button', { name: 'Hide it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t hide it. Try again.');
    expect(api.getHistory).toHaveBeenCalledTimes(1);
  });

  it('drops admin mode when the key is no longer accepted', async () => {
    const adminApi = fakeAdminApi();
    adminApi.describeDevice.mockRejectedValue(new ApiError(401));
    const { onRejected } = renderAsAdmin(adminApi);

    await userEvent.click((await firstEntry()).getByRole('button', { name: 'Hide everything from this poster' }));

    await waitFor(() => expect(onRejected).toHaveBeenCalled());
  });
});
