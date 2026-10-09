import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { loadAdminKey, saveAdminKey } from './king/admin';
import { ApiError } from './king/api';
import { navigate } from './routing/routes';
import { ADMIN_KEY, event, fakeAdminApi, fakeApi, NOW } from './test/fakeApi';
import { memoryStorage } from './test/memoryStorage';
import { renderInEnglish } from './test/render';

// The whole admin loop through App: key checked and remembered, history unlocked, signed out or rejected.
const renderAt = (path: string, storage = memoryStorage(), adminApi = fakeAdminApi()) => {
  window.history.replaceState(null, '', path);
  const api = fakeApi(undefined, { history: { events: [event({ id: 'e1' })], next: null } });
  renderInEnglish(<App api={api} adminApi={adminApi} reporterKey="k" storage={storage} now={() => NOW} />);
  return { storage, adminApi };
};

const hideButtons = () => screen.queryAllByRole('button', { name: 'Hide this entry' });

describe('admin, through the app', () => {
  it('remembers a checked key on this device and unlocks hiding on the history page', async () => {
    const { storage } = renderAt('/admin');

    await userEvent.type(screen.getByLabelText('Admin key'), ADMIN_KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Check key' }));

    expect(await screen.findByRole('button', { name: 'Sign out on this device' })).toBeInTheDocument();
    expect(loadAdminKey(storage)).toBe(ADMIN_KEY);
    act(() => navigate('history'));
    expect(await screen.findAllByRole('button', { name: 'Hide this entry' })).toHaveLength(1);
  });

  it('shows no hiding on the history page without a key', async () => {
    renderAt('/history');

    await screen.findByText('Fed by a neighbor');
    expect(hideButtons()).toHaveLength(0);
  });

  it('forgets the key on sign out', async () => {
    const storage = memoryStorage();
    saveAdminKey(storage, ADMIN_KEY);
    renderAt('/admin', storage);

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out on this device' }));

    expect(screen.getByLabelText('Admin key')).toBeInTheDocument();
    expect(loadAdminKey(storage)).toBeNull();
  });

  it('forgets a remembered key the server no longer accepts', async () => {
    const storage = memoryStorage();
    saveAdminKey(storage, 'rotated-away');
    const adminApi = fakeAdminApi();
    adminApi.hiddenEntries.mockRejectedValue(new ApiError(401));
    renderAt('/admin', storage, adminApi);

    expect(await screen.findByLabelText('Admin key')).toBeInTheDocument();
    await waitFor(() => expect(loadAdminKey(storage)).toBeNull());
  });

  it('hides from the history page with the remembered key', async () => {
    const storage = memoryStorage();
    saveAdminKey(storage, ADMIN_KEY);
    const { adminApi } = renderAt('/history', storage);

    await userEvent.click(await screen.findByRole('button', { name: 'Hide this entry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide it' }));

    expect(adminApi.hideEntry).toHaveBeenCalledWith(ADMIN_KEY, 'e1');
  });

  it('forgets a remembered key the history page finds rejected, and drops the hide buttons', async () => {
    const storage = memoryStorage();
    saveAdminKey(storage, 'rotated-away');
    const adminApi = fakeAdminApi();
    adminApi.hideEntry.mockRejectedValue(new ApiError(401));
    renderAt('/history', storage, adminApi);

    await userEvent.click(await screen.findByRole('button', { name: 'Hide this entry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide it' }));

    await waitFor(() => expect(hideButtons()).toHaveLength(0));
    expect(loadAdminKey(storage)).toBeNull();
  });

  it('loads the hidden lists once, not again each time the clock re-renders the app', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const storage = memoryStorage();
      saveAdminKey(storage, ADMIN_KEY);
      const { adminApi } = renderAt('/admin', storage);
      await screen.findByText('No hidden entries.');

      await act(() => vi.advanceTimersByTimeAsync(65_000));

      expect(adminApi.hiddenEntries).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
