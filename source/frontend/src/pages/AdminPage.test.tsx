import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HiddenDevice } from '../king/admin';
import { ApiError } from '../king/api';
import { ADMIN_KEY, device, event, fakeAdminApi, NOW } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';
import { AdminPage } from './AdminPage';

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

const hiddenDevice = (overrides: Partial<HiddenDevice> = {}): HiddenDevice => ({
  ...device({ entries: 14, spots: 2, reporterName: 'Spammy' }),
  id: 'hidden-1',
  hiddenAt: NOW.toISOString(),
  ...overrides,
});

const renderPage = (api = fakeAdminApi(), adminKey: string | null = null) => {
  const onKey = vi.fn<(key: string | null) => void>();
  renderInEnglish(<AdminPage api={api} adminKey={adminKey} onKey={onKey} spots={[]} now={NOW} />);
  return { api, onKey };
};

const enterKey = async (key: string) => {
  await userEvent.type(screen.getByLabelText('Admin key'), key);
  await userEvent.click(screen.getByRole('button', { name: 'Check key' }));
};

describe('AdminPage — without a key', () => {
  it('asks for the key with its heading focused', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toHaveFocus();
    expect(screen.getByLabelText('Admin key')).toHaveAttribute('type', 'password');
  });

  it('checks the key with the server and keeps it when it works', async () => {
    const { api, onKey } = renderPage();

    await enterKey(`  ${ADMIN_KEY} `);

    expect(api.check).toHaveBeenCalledWith(ADMIN_KEY);
    expect(onKey).toHaveBeenCalledWith(ADMIN_KEY);
  });

  it('says so when the key is wrong, and keeps nothing', async () => {
    const api = fakeAdminApi();
    api.check.mockRejectedValue(new ApiError(401));
    const { onKey } = renderPage(api);

    await enterKey('wrong-key');

    expect(await screen.findByRole('alert')).toHaveTextContent('That key didn’t work.');
    expect(onKey).not.toHaveBeenCalled();
  });

  it('spots the hash pasted instead of the key, without asking the server', async () => {
    const { api, onKey } = renderPage();

    await enterKey(HASH);

    expect(await screen.findByRole('alert')).toHaveTextContent('That looks like the key’s hash. Enter the key itself');
    expect(api.check).not.toHaveBeenCalled();
    expect(onKey).not.toHaveBeenCalled();
  });

  it('says to wait after too many tries', async () => {
    const api = fakeAdminApi();
    api.check.mockRejectedValue(new ApiError(429));
    renderPage(api);

    await enterKey('wrong-key');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries. Wait a minute, then try again.');
  });

  it('says so when the site can’t be reached', async () => {
    const api = fakeAdminApi();
    api.check.mockRejectedValue(new TypeError('offline'));
    renderPage(api);

    await enterKey(ADMIN_KEY);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t reach the site.');
  });
});

describe('AdminPage — with a key', () => {
  it('lists hidden entries and hidden posters', async () => {
    const api = fakeAdminApi({
      hiddenEntries: [event({ id: 'e1', reporterName: 'Kael' })],
      hiddenDevices: [hiddenDevice(), hiddenDevice({ id: 'hidden-2', reporterName: null, entries: 1, spots: 0 })],
    });
    renderPage(api, ADMIN_KEY);

    const entries = within(await screen.findByRole('list', { name: 'Hidden entries' }));
    expect(entries.getByText('Fed by Kael')).toBeInTheDocument();
    const posters = within(screen.getByRole('list', { name: 'Hidden posters' })).getAllByRole('listitem');
    expect(posters.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Spammy14 entries · 2 spots'),
      expect.stringContaining('a neighbor1 entry · 0 spots'),
    ]);
    expect(api.hiddenEntries).toHaveBeenCalledWith(ADMIN_KEY);
    expect(api.hiddenDevices).toHaveBeenCalledWith(ADMIN_KEY);
  });

  it('shows a hidden entry again', async () => {
    const api = fakeAdminApi({ hiddenEntries: [event({ id: 'e1', reporterName: 'Kael' })] });
    renderPage(api, ADMIN_KEY);

    await userEvent.click(await screen.findByRole('button', { name: 'Show again' }));

    expect(api.unhideEntry).toHaveBeenCalledWith(ADMIN_KEY, 'e1');
    expect(await screen.findByText('No hidden entries.')).toBeInTheDocument();
  });

  it('restores a hidden poster', async () => {
    const api = fakeAdminApi({ hiddenDevices: [hiddenDevice()] });
    renderPage(api, ADMIN_KEY);

    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    expect(api.restoreDevice).toHaveBeenCalledWith(ADMIN_KEY, 'hidden-1');
    expect(await screen.findByText('No hidden posters.')).toBeInTheDocument();
  });

  it('says when nothing is hidden', async () => {
    renderPage(fakeAdminApi(), ADMIN_KEY);

    expect(await screen.findByText('No hidden entries.')).toBeInTheDocument();
    expect(screen.getByText('No hidden posters.')).toBeInTheDocument();
  });

  it('points to the history page for hiding', async () => {
    renderPage(fakeAdminApi(), ADMIN_KEY);

    expect(await screen.findByRole('link', { name: 'King’s history' })).toHaveAttribute('href', '/history');
  });

  it('forgets a key the server no longer accepts', async () => {
    const api = fakeAdminApi();
    api.hiddenEntries.mockRejectedValue(new ApiError(401));
    const { onKey } = renderPage(api, ADMIN_KEY);

    await waitFor(() => expect(onKey).toHaveBeenCalledWith(null));
  });

  it('says so when the lists can’t load', async () => {
    const api = fakeAdminApi();
    api.hiddenDevices.mockRejectedValue(new TypeError('offline'));
    const { onKey } = renderPage(api, ADMIN_KEY);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load what’s hidden.');
    expect(onKey).not.toHaveBeenCalled();
  });

  it('signs out on this device', async () => {
    const { onKey } = renderPage(fakeAdminApi(), ADMIN_KEY);

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out on this device' }));

    expect(onKey).toHaveBeenCalledWith(null);
  });
});
