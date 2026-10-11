import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HiddenDevice } from '../king/admin';
import { ApiError } from '../king/api';
import { ADMIN_KEY, adminSpot, device, event, fakeAdminApi, NOW } from '../test/fakeApi';
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
  const onSpotRenamed = vi.fn<(id: string, name: string) => void>();
  renderInEnglish(<AdminPage api={api} adminKey={adminKey} onKey={onKey} spots={[]} onSpotRenamed={onSpotRenamed} now={NOW} />);
  return { api, onKey, onSpotRenamed };
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

describe('AdminPage — renaming a place', () => {
  const places = [adminSpot('s1', 'Porch'), adminSpot('s2', 'back steps'), adminSpot('s3', 'Spam spot', true)];
  const renameButton = (name: string) => screen.getByRole('button', { name: `Rename ${name}` });
  const nameField = () => screen.getByRole('textbox', { name: 'New name' });
  const renderPlaces = (api = fakeAdminApi({ spots: places })) => renderPage(api, ADMIN_KEY);

  it('lists every place by name, marking a hidden poster’s, each with its own Rename button', async () => {
    const { api } = renderPlaces();

    const items = within(await screen.findByRole('list', { name: 'Places' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['back stepsRename', 'PorchRename', 'Spam spotfrom a hidden posterRename']);
    expect(api.listSpots).toHaveBeenCalledWith(ADMIN_KEY);
  });

  it('says when there are no places yet', async () => {
    renderPlaces(fakeAdminApi());

    expect(await screen.findByText('No places yet.')).toBeInTheDocument();
  });

  it('opens a field with the current name, focused, limited like a new place', async () => {
    renderPlaces();

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    expect(nameField()).toHaveValue('Porch');
    expect(nameField()).toHaveFocus();
    expect(nameField()).toHaveAttribute('maxlength', '40');
    expect(nameField()).toBeRequired();
  });

  it('saves the trimmed name, shows it, tells the app, and returns focus to the place', async () => {
    const { api, onSpotRenamed } = renderPlaces();
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '  Front porch ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.renameSpot).toHaveBeenCalledWith(ADMIN_KEY, 's1', 'Front porch');
    expect(onSpotRenamed).toHaveBeenCalledWith('s1', 'Front porch');
    expect(await screen.findByRole('button', { name: 'Rename Front porch' })).toHaveFocus();
    expect(screen.queryByRole('textbox', { name: 'New name' })).not.toBeInTheDocument();
    expect(screen.queryByText('Porch')).not.toBeInTheDocument();
  });

  it('renames a hidden poster’s place, which stays marked', async () => {
    const { api } = renderPlaces();
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Spam spot' }));

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Old porch');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.renameSpot).toHaveBeenCalledWith(ADMIN_KEY, 's3', 'Old porch');
    const item = (await screen.findByRole('button', { name: 'Rename Old porch' })).closest('li')!;
    expect(item).toHaveTextContent('from a hidden poster');
  });

  it('cancels without saving and returns focus to the place', async () => {
    const { api, onSpotRenamed } = renderPlaces();
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    await userEvent.type(nameField(), ' changed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.renameSpot).not.toHaveBeenCalled();
    expect(onSpotRenamed).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'New name' })).not.toBeInTheDocument();
    expect(renameButton('Porch')).toHaveFocus();
  });

  it('keeps the field open and says so when another place has the name', async () => {
    const api = fakeAdminApi({ spots: places });
    api.renameSpot.mockRejectedValue(new ApiError(400, ['name.taken']));
    const { onSpotRenamed } = renderPlaces(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Back steps');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Another place already has that name.');
    expect(nameField()).toHaveValue('Back steps');
    expect(nameField()).toHaveAccessibleDescription('Another place already has that name.');
    expect(onSpotRenamed).not.toHaveBeenCalled();
  });

  it('asks for a name when only spaces were entered', async () => {
    const api = fakeAdminApi({ spots: places });
    api.renameSpot.mockRejectedValue(new ApiError(400, ['name.required']));
    renderPlaces(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.renameSpot).toHaveBeenCalledWith(ADMIN_KEY, 's1', '');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name.');
  });

  it('says it didn’t work when saving fails for another reason', async () => {
    const api = fakeAdminApi({ spots: places });
    api.renameSpot.mockRejectedValue(new ApiError(500));
    renderPlaces(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t work. Try again.');
    expect(nameField()).toBeInTheDocument();
  });

  it('forgets a key the server no longer accepts', async () => {
    const api = fakeAdminApi({ spots: places });
    api.renameSpot.mockRejectedValue(new ApiError(401));
    const { onKey } = renderPlaces(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onKey).toHaveBeenCalledWith(null));
  });

  it('renames one place at a time', async () => {
    renderPlaces();
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Porch' }));

    await userEvent.click(renameButton('back steps'));

    expect(screen.getAllByRole('textbox', { name: 'New name' })).toHaveLength(1);
    expect(nameField()).toHaveValue('back steps');
  });

  it('reloads the places after restoring a poster, so the mark goes', async () => {
    const api = fakeAdminApi({ spots: places, hiddenDevices: [hiddenDevice()] });
    renderPlaces(api);
    api.listSpots.mockResolvedValue([adminSpot('s1', 'Porch'), adminSpot('s2', 'back steps'), adminSpot('s3', 'Spam spot')]);

    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.queryByText('from a hidden poster')).not.toBeInTheDocument());
    expect(api.listSpots).toHaveBeenCalledTimes(2);
  });
});
