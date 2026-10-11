import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { loadAdminSignIn, saveAdminSignIn } from './king/admin';
import { saveNickname } from './king/reporter';
import { ApiError } from './king/api';
import { navigate } from './routing/routes';
import { ADMIN_KEY, adminSpot, event, fakeAdminApi, fakeApi, NOW, SIGN_IN, spot } from './test/fakeApi';
import { memoryStorage } from './test/memoryStorage';
import { renderInEnglish } from './test/render';

// The whole admin loop through App: key checked and remembered, history unlocked, signed out or rejected.
const renderAt = (path: string, storage = memoryStorage(), adminApi = fakeAdminApi(), spots = [spot('s1', 'Porch'), spot('s2', 'Corner')]) => {
  window.history.replaceState(null, '', path);
  const api = fakeApi(undefined, { history: { events: [event({ id: 'e1' })], next: null }, spots });
  renderInEnglish(<App api={api} adminApi={adminApi} reporterKey="k" storage={storage} now={() => NOW} />);
  return { storage, adminApi };
};

const hideButtons = () => screen.queryAllByRole('button', { name: 'Hide this entry' });

describe('admin, through the app', () => {
  it('remembers a checked key on this device and unlocks hiding on the history page', async () => {
    const { storage } = renderAt('/admin');

    // The admin page loads on demand, so its fields arrive a moment later.
    await userEvent.type(await screen.findByLabelText('Admin key'), ADMIN_KEY);
    await userEvent.type(screen.getByLabelText('Your name'), SIGN_IN.name);
    await userEvent.click(screen.getByRole('button', { name: 'Check key' }));

    expect(await screen.findByRole('button', { name: 'Sign out on this device' })).toBeInTheDocument();
    expect(loadAdminSignIn(storage)).toEqual(SIGN_IN);
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
    saveAdminSignIn(storage, SIGN_IN);
    renderAt('/admin', storage);

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out on this device' }));

    expect(screen.getByLabelText('Admin key')).toBeInTheDocument();
    expect(loadAdminSignIn(storage)).toBeNull();
  });

  it('forgets a remembered key the server no longer accepts', async () => {
    const storage = memoryStorage();
    saveAdminSignIn(storage, { key: 'rotated-away', name: '' });
    const adminApi = fakeAdminApi();
    adminApi.hiddenEntries.mockRejectedValue(new ApiError(401));
    renderAt('/admin', storage, adminApi);

    expect(await screen.findByLabelText('Admin key')).toBeInTheDocument();
    await waitFor(() => expect(loadAdminSignIn(storage)).toBeNull());
  });

  it('hides from the history page with the remembered key', async () => {
    const storage = memoryStorage();
    saveAdminSignIn(storage, SIGN_IN);
    const { adminApi } = renderAt('/history', storage);

    await userEvent.click(await screen.findByRole('button', { name: 'Hide this entry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide it' }));

    expect(adminApi.hideEntry).toHaveBeenCalledWith(SIGN_IN, 'e1');
  });

  it('forgets a remembered key the history page finds rejected, and drops the hide buttons', async () => {
    const storage = memoryStorage();
    saveAdminSignIn(storage, { key: 'rotated-away', name: '' });
    const adminApi = fakeAdminApi();
    adminApi.hideEntry.mockRejectedValue(new ApiError(401));
    renderAt('/history', storage, adminApi);

    await userEvent.click(await screen.findByRole('button', { name: 'Hide this entry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide it' }));

    await waitFor(() => expect(hideButtons()).toHaveLength(0));
    expect(loadAdminSignIn(storage)).toBeNull();
  });

  it('loads the hidden lists once, not again each time the clock re-renders the app', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const storage = memoryStorage();
      saveAdminSignIn(storage, SIGN_IN);
      const { adminApi } = renderAt('/admin', storage);
      await screen.findByText('No hidden entries.');

      await act(() => vi.advanceTimersByTimeAsync(65_000));

      expect(adminApi.hiddenEntries).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a renamed place shows its new name across the app at once', async () => {
    const storage = memoryStorage();
    saveAdminSignIn(storage, SIGN_IN);
    saveNickname(storage, 'Kit');
    const adminApi = fakeAdminApi({ spots: [adminSpot('s1', 'Porch'), adminSpot('s2', 'Corner')] });
    renderAt('/admin', storage, adminApi);

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'New name' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New name' }), 'Front porch');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Rename Front porch' });

    act(() => navigate('home'));
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));

    // The feed screen's tiles are the app's own list: the new name, the other place untouched.
    expect(screen.getByRole('radio', { name: 'Front porch' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Corner' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Porch' })).not.toBeInTheDocument();
  });

  it('merged places leave the app at once, under the kept place’s name', async () => {
    const storage = memoryStorage();
    saveAdminSignIn(storage, SIGN_IN);
    saveNickname(storage, 'Kit');
    const adminApi = fakeAdminApi({ spots: [adminSpot('s1', 'Porch', false, 2), adminSpot('s2', 'Corner'), adminSpot('s3', 'Steps')] });
    renderAt('/admin', storage, adminApi, [spot('s1', 'Porch'), spot('s2', 'Corner'), spot('s3', 'Steps')]);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Porch for merging' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Corner for merging' }));
    await userEvent.click(screen.getByRole('button', { name: 'Merge 2 places…' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New name (optional)' }), 'Front porch');
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(adminApi.mergeSpots).toHaveBeenCalled());

    act(() => navigate('home'));
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));

    expect(screen.getByRole('radio', { name: 'Front porch' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Steps' })).toBeInTheDocument(); // a place outside the merge keeps its name
    expect(screen.queryByRole('radio', { name: 'Corner' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Porch' })).not.toBeInTheDocument();
  });
});
