import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRecord, AdminSignIn, AdminTouched, HiddenDevice } from '../king/admin';
import { ApiError } from '../king/api';
import { ADMIN_KEY, adminSpot, device, event, fakeAdminApi, hiddenPhoto, NOW, SIGN_IN } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';
import { AdminPage } from './AdminPage';

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

const hiddenDevice = (overrides: Partial<HiddenDevice> = {}): HiddenDevice => ({
  ...device({ entries: 14, spots: 2, reporterName: 'Spammy' }),
  id: 'hidden-1',
  hiddenAt: NOW.toISOString(),
  ...overrides,
});

const renderPage = (api = fakeAdminApi(), signIn: AdminSignIn | null = null) => {
  const onKey = vi.fn<(signIn: AdminSignIn | null) => void>();
  const onSpotRenamed = vi.fn<(id: string, name: string) => void>();
  const onSpotsMerged = vi.fn<(keptId: string, name: string, mergedIds: string[]) => void>();
  renderInEnglish(
    <AdminPage
      api={api}
      signIn={signIn}
      onSignIn={onKey}
      spots={[]}
      onSpotRenamed={onSpotRenamed}
      onSpotsMerged={onSpotsMerged}
      now={NOW}
    />,
  );
  return { api, onKey, onSpotRenamed, onSpotsMerged };
};

const enterKey = async (key: string, name = SIGN_IN.name) => {
  await userEvent.type(screen.getByLabelText('Admin key'), key);
  await userEvent.type(screen.getByLabelText('Your name'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Check key' }));
};

describe('AdminPage — without a key', () => {
  it('asks for the key with its heading focused', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toHaveFocus();
    expect(screen.getByLabelText('Admin key')).toHaveAttribute('type', 'password');
  });

  it('checks the key with the server and keeps it, with the name typed, when it works', async () => {
    const { api, onKey } = renderPage();

    await enterKey(`  ${ADMIN_KEY} `, '  Wallie ');

    expect(api.check).toHaveBeenCalledWith({ key: ADMIN_KEY, name: 'Wallie' });
    expect(onKey).toHaveBeenCalledWith({ key: ADMIN_KEY, name: 'Wallie' });
  });

  it('asks for a name, saying it is kept with what the admin does', () => {
    renderPage();

    const name = screen.getByLabelText('Your name');
    expect(name).toBeRequired();
    expect(name).toHaveAccessibleDescription('Saved with everything you do here, so the other caretakers can see who did what.');
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
    renderPage(api, SIGN_IN);

    const entries = within(await screen.findByRole('list', { name: 'Hidden entries' }));
    expect(entries.getByText('Fed by Kael')).toBeInTheDocument();
    const posters = within(screen.getByRole('list', { name: 'Hidden posters' })).getAllByRole('listitem');
    expect(posters.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Spammy14 entries · 2 spots'),
      expect.stringContaining('a neighbor1 entry · 0 spots'),
    ]);
    expect(api.hiddenEntries).toHaveBeenCalledWith(SIGN_IN);
    expect(api.hiddenDevices).toHaveBeenCalledWith(SIGN_IN);
  });

  it('shows a hidden entry again', async () => {
    const api = fakeAdminApi({ hiddenEntries: [event({ id: 'e1', reporterName: 'Kael' })] });
    renderPage(api, SIGN_IN);

    await userEvent.click(await screen.findByRole('button', { name: 'Show again' }));

    expect(api.unhideEntry).toHaveBeenCalledWith(SIGN_IN, 'e1');
    expect(await screen.findByText('No hidden entries.')).toBeInTheDocument();
  });

  it('restores a hidden poster', async () => {
    const api = fakeAdminApi({ hiddenDevices: [hiddenDevice()] });
    renderPage(api, SIGN_IN);

    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    expect(api.restoreDevice).toHaveBeenCalledWith(SIGN_IN, 'hidden-1');
    expect(await screen.findByText('No hidden posters.')).toBeInTheDocument();
  });

  it('says when nothing is hidden', async () => {
    renderPage(fakeAdminApi(), SIGN_IN);

    expect(await screen.findByText('No hidden entries.')).toBeInTheDocument();
    expect(screen.getByText('No hidden posters.')).toBeInTheDocument();
    expect(screen.getByText('No hidden photos.')).toBeInTheDocument();
  });

  it('lists hidden photos in words, never showing the picture', async () => {
    // Local noon, so the times read the same in any time zone.
    const noon = new Date('2026-10-08T12:00:00').toISOString();
    const onFeeding = hiddenPhoto({
      id: 'p1',
      event: event({ kind: 'fed', reporterName: 'Kael', spotName: 'Porch', photoId: null, occurredAt: noon }),
    });
    const shared = hiddenPhoto({ id: 'p2', reporterName: 'Sarah', postedAt: noon });
    const api = fakeAdminApi({
      hiddenPhotos: [onFeeding, shared, hiddenPhoto({ id: 'p3', event: event({ kind: 'seen', occurredAt: noon }) })],
    });
    renderPage(api, SIGN_IN);

    const list = await screen.findByRole('list', { name: 'Hidden photos' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Photo on a feeding by Kael at Porch (Oct 8, 12:00 PM)No reason recordedShow photo again',
      'Shared photo by Sarah (Oct 8, 12:00 PM)No reason recordedShow photo again',
      'Photo on a sighting by a neighbor (Oct 8, 12:00 PM)No reason recordedShow photo again',
    ]);
    // Any <img>, decorative ones too: alt="" takes an image out of the img role.
    expect(list.querySelector('img')).toBeNull();
    expect(api.hiddenPhotos).toHaveBeenCalledWith(SIGN_IN);
  });

  it('says why, when and by whom each photo was hidden, so a later admin can tell them apart', async () => {
    const hiddenAt = '2026-10-08T15:40:00';
    const api = fakeAdminApi({
      hiddenPhotos: [
        hiddenPhoto({ id: 'p1', reporterName: 'Sarah', hidden: { reason: 'notKing', note: null, at: new Date(hiddenAt).toISOString(), by: 'Wallie' } }),
        hiddenPhoto({ id: 'p2', reporterName: 'Sarah', hidden: { reason: 'other', note: 'a thumb over the lens', at: new Date(hiddenAt).toISOString(), by: null } }),
      ],
    });
    renderPage(api, SIGN_IN);

    const list = await screen.findByRole('list', { name: 'Hidden photos' });
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('.activity-detail')?.textContent)).toEqual([
      'Hidden Oct 8, 3:40 PM by Wallie · Not King',
      'Hidden Oct 8, 3:40 PM by no name · Other: “a thumb over the lens”',
    ]);
  });

  it('shows a hidden photo again', async () => {
    const api = fakeAdminApi({ hiddenPhotos: [hiddenPhoto({ id: 'p1', reporterName: 'Sarah' })] });
    renderPage(api, SIGN_IN);

    await userEvent.click(await screen.findByRole('button', { name: 'Show photo again' }));

    expect(api.showPhoto).toHaveBeenCalledWith(SIGN_IN, 'p1');
    expect(await screen.findByText('No hidden photos.')).toBeInTheDocument();
  });

  it('points to the history page for hiding', async () => {
    renderPage(fakeAdminApi(), SIGN_IN);

    expect(await screen.findByRole('link', { name: 'King’s history' })).toHaveAttribute('href', '/history');
  });

  it('forgets a key the server no longer accepts', async () => {
    const api = fakeAdminApi();
    api.hiddenEntries.mockRejectedValue(new ApiError(401));
    const { onKey } = renderPage(api, SIGN_IN);

    await waitFor(() => expect(onKey).toHaveBeenCalledWith(null));
  });

  it('says so when the lists can’t load', async () => {
    const api = fakeAdminApi();
    api.hiddenDevices.mockRejectedValue(new TypeError('offline'));
    const { onKey } = renderPage(api, SIGN_IN);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load what’s hidden.');
    expect(onKey).not.toHaveBeenCalled();
  });

  it('signs out on this device', async () => {
    const { onKey } = renderPage(fakeAdminApi(), SIGN_IN);

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out on this device' }));

    expect(onKey).toHaveBeenCalledWith(null);
  });
});

describe('AdminPage — renaming a place', () => {
  const places = [adminSpot('s1', 'Porch'), adminSpot('s2', 'back steps'), adminSpot('s3', 'Spam spot', true)];
  const renameButton = (name: string) => screen.getByRole('button', { name: `Rename ${name}` });
  const nameField = () => screen.getByRole('textbox', { name: 'New name' });
  const renderPlaces = (api = fakeAdminApi({ spots: places })) => renderPage(api, SIGN_IN);

  it('lists every place by name, marking a hidden poster’s, each with its own Rename button', async () => {
    const { api } = renderPlaces();

    const items = within(await screen.findByRole('list', { name: 'Places' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'back steps0 feedingsRename',
      'Porch0 feedingsRename',
      'Spam spot0 feedings · from a hidden posterRename',
    ]);
    expect(api.listSpots).toHaveBeenCalledWith(SIGN_IN);
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

    expect(api.renameSpot).toHaveBeenCalledWith(SIGN_IN, 's1', 'Front porch');
    expect(onSpotRenamed).toHaveBeenCalledWith('s1', 'Front porch');
    await waitFor(() => expect(api.activity).toHaveBeenCalledTimes(2)); // the activity log shows the rename
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

    expect(api.renameSpot).toHaveBeenCalledWith(SIGN_IN, 's3', 'Old porch');
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

    expect(api.renameSpot).toHaveBeenCalledWith(SIGN_IN, 's1', '');
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

type RecordOverrides = Partial<Omit<ActivityRecord, 'touched'>> & Pick<ActivityRecord, 'action'> & { touched?: Partial<AdminTouched> };

const record = (overrides: RecordOverrides): ActivityRecord => ({
  id: `r-${overrides.action}`,
  at: NOW.toISOString(),
  adminName: 'Wallie',
  address: '203.0.113.7',
  ...overrides,
  touched: {
    posterName: null,
    entries: null,
    spots: null,
    entryKind: null,
    entryAt: null,
    placeName: null,
    newName: null,
    mergedNames: null,
    feedings: null,
    ...overrides.touched,
  },
});

describe('AdminPage — activity', () => {
  const activityItems = async () =>
    within(await screen.findByRole('list', { name: 'Activity' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);

  it('says in words what each action touched, newest first', async () => {
    const records = [
      record({ action: 'mergePlaces', touched: { placeName: 'Porch', newName: null, mergedNames: ['Steps', 'Stoop'], feedings: 1 } }),
      record({ action: 'mergePlaces', touched: { placeName: 'porch', newName: 'Porch', mergedNames: ['PORCH'], feedings: 3 } }),
      record({ action: 'renamePlace', touched: { placeName: 'Porch', newName: 'Front porch' } }),
      record({ action: 'restorePoster', touched: { posterName: null, entries: 1, spots: 0 } }),
      record({ action: 'showPhoto', touched: { posterName: null, entryAt: NOW.toISOString() } }),
      record({ action: 'hidePhoto', touched: { posterName: 'Sarah', entryKind: 'seen', entryAt: NOW.toISOString(), reason: 'unlawful', note: 'reported' } }),
      record({ action: 'hidePoster', touched: { posterName: 'Spammy', entries: 14, spots: 2 } }),
      record({ action: 'showEntry', touched: { posterName: null, entryKind: 'seen', entryAt: NOW.toISOString() } }),
      record({ action: 'hideEntry', touched: { posterName: 'Sarah', entryKind: 'fed', entryAt: NOW.toISOString(), placeName: 'Porch' } }),
      record({ action: 'signInFailed', adminName: null }),
      record({ action: 'signIn' }),
    ];
    renderPage(fakeAdminApi({ activity: { records, next: null } }), SIGN_IN);

    const items = await activityItems();

    expect(items.map((text) => text?.split('Wallie')[0].split('no name')[0])).toEqual([
      'Merged Steps and Stoop into Porch (1 feeding moved)',
      'Merged PORCH into porch, now called Porch (3 feedings moved)',
      'Renamed Porch to Front porch',
      'Restored everything from a neighbor (1 entry, 0 spots)',
      'Showed a photo shared by a neighbor again (Oct 8)',
      'Hid the photo on a sighting by Sarah (Oct 8) · Possibly unlawful: “reported”',
      'Hid everything from Spammy (14 entries, 2 spots)',
      'Showed a sighting by a neighbor again (Oct 8)',
      'Hid a feeding by Sarah at Porch (Oct 8)',
      'Tried a wrong key',
      'Signed in',
    ]);
  });

  it('says who, from where and when — "no name" when none was typed', async () => {
    const records = [record({ action: 'signInFailed', adminName: null, address: '198.51.100.9' }), record({ action: 'signIn' })];
    renderPage(fakeAdminApi({ activity: { records, next: null } }), SIGN_IN);

    const [failed, signedIn] = await activityItems();

    expect(failed).toContain('no name · 198.51.100.9 · Oct 8');
    expect(signedIn).toContain('Wallie · 203.0.113.7 · Oct 8');
    expect(screen.getByText(/a name is a claim, not proof/)).toBeInTheDocument();
  });

  it('says when there is nothing yet', async () => {
    renderPage(fakeAdminApi(), SIGN_IN);

    expect(await screen.findByText('Nothing yet.')).toBeInTheDocument();
  });

  it('shows older activity on request and moves focus to the first older line', async () => {
    const api = fakeAdminApi({ activity: { records: [record({ action: 'signIn', id: 'new' })], next: 'new' } });
    api.activity.mockResolvedValueOnce({ records: [record({ action: 'signIn', id: 'new' })], next: 'new' });
    api.activity.mockResolvedValueOnce({ records: [record({ action: 'signInFailed', id: 'old' })], next: null });
    renderPage(api, SIGN_IN);

    await userEvent.click(await screen.findByRole('button', { name: 'Show older activity' }));

    expect(api.activity).toHaveBeenLastCalledWith(SIGN_IN, 'new');
    expect((await screen.findByText('Tried a wrong key')).closest('li')).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Show older activity' })).not.toBeInTheDocument();
  });

  it('reloads after a change made on this page', async () => {
    const api = fakeAdminApi({ hiddenEntries: [event({ id: 'e1', reporterName: 'Kael' })] });
    renderPage(api, SIGN_IN);
    await screen.findByText('Nothing yet.');
    api.activity.mockResolvedValue({ records: [record({ action: 'showEntry', touched: { posterName: 'Kael', entryKind: 'fed' } })], next: null });

    await userEvent.click(await screen.findByRole('button', { name: 'Show again' }));

    expect(await screen.findByText(/Showed a feeding by Kael again/)).toBeInTheDocument();
  });

  it('says so when it can’t load, and forgets a rejected key', async () => {
    const api = fakeAdminApi();
    api.activity.mockRejectedValueOnce(new TypeError('offline'));
    renderPage(api, SIGN_IN);

    expect(await screen.findByText('Couldn’t load the activity.')).toBeInTheDocument();

    api.activity.mockRejectedValueOnce(new ApiError(401));
    const { onKey } = renderPage(api, SIGN_IN);
    await waitFor(() => expect(onKey).toHaveBeenCalledWith(null));
  });
});

describe('AdminPage — merging places', () => {
  const places = [adminSpot('s1', 'back steps', false, 3), adminSpot('s2', 'Porch', false, 5), adminSpot('s3', 'Spam spot', true, 1)];
  const tick = (name: string) => userEvent.click(screen.getByRole('checkbox', { name: `Select ${name} for merging` }));
  const renderPlaces = (api = fakeAdminApi({ spots: places })) => renderPage(api, SIGN_IN);
  const confirmation = () => screen.getByText(/can’t be undone/);

  it('shows how many feedings each place has, and offers Merge once two or more are ticked', async () => {
    renderPlaces();
    await screen.findByRole('list', { name: 'Places' });

    expect(screen.getByText('Tick two or more places to merge them.')).toBeInTheDocument();
    expect(screen.getByText('5 feedings')).toBeInTheDocument();
    await tick('Porch');
    expect(screen.queryByRole('button', { name: /^Merge/ })).not.toBeInTheDocument();
    await tick('back steps');
    expect(screen.getByRole('button', { name: 'Merge 2 places…' })).toBeInTheDocument();
  });

  it('keeps the busiest place by default and says what moves before merging, which can’t be undone', async () => {
    const { api, onSpotsMerged } = renderPlaces();
    await screen.findByRole('list', { name: 'Places' });
    await tick('Porch');
    await tick('Spam spot');
    await tick('back steps');

    await userEvent.click(screen.getByRole('button', { name: 'Merge 3 places…' }));

    expect(screen.getByRole('radio', { name: 'Porch' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Porch' })).toHaveFocus();
    expect(confirmation()).toHaveTextContent(
      'Merge back steps and Spam spot into Porch? 4 feedings move there. The other places are deleted for good — this can’t be undone.',
    );
    api.listSpots.mockResolvedValue([adminSpot('s2', 'Porch', false, 9)]);
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(api.mergeSpots).toHaveBeenCalledWith(SIGN_IN, 's2', ['s1', 's3'], undefined);
    expect(onSpotsMerged).toHaveBeenCalledWith('s2', 'Porch', ['s1', 's3']);
    expect(await screen.findByText('9 feedings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Porch' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Rename back steps' })).not.toBeInTheDocument();
    await waitFor(() => expect(api.activity).toHaveBeenCalledTimes(2));
  });

  it('keeps the place picked, under a new trimmed name', async () => {
    const { api, onSpotsMerged } = renderPlaces();
    await screen.findByRole('list', { name: 'Places' });
    await tick('Porch');
    await tick('back steps');
    await userEvent.click(screen.getByRole('button', { name: 'Merge 2 places…' }));

    await userEvent.click(screen.getByRole('radio', { name: 'back steps' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New name (optional)' }), '  Front porch ');

    expect(confirmation()).toHaveTextContent('Merge Porch into back steps? 5 feedings move there.');
    expect(screen.getByText('back steps will then be called Front porch.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(api.mergeSpots).toHaveBeenCalledWith(SIGN_IN, 's1', ['s2'], 'Front porch');
    expect(onSpotsMerged).toHaveBeenCalledWith('s1', 'Front porch', ['s2']);
  });

  it('cancels without merging, back on the Merge button', async () => {
    const { api } = renderPlaces();
    await screen.findByRole('list', { name: 'Places' });
    await tick('Porch');
    await tick('back steps');
    await userEvent.click(screen.getByRole('button', { name: 'Merge 2 places…' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel merging' }));

    expect(api.mergeSpots).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Merge 2 places…' })).toHaveFocus();
  });

  it('says when the new name is taken, tied to the field', async () => {
    const api = fakeAdminApi({ spots: places });
    api.mergeSpots.mockRejectedValue(new ApiError(400, ['name.taken']));
    renderPlaces(api);
    await screen.findByRole('list', { name: 'Places' });
    await tick('Porch');
    await tick('back steps');
    await userEvent.click(screen.getByRole('button', { name: 'Merge 2 places…' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New name (optional)' }), 'Spam spot');

    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Another place already has that name.');
    expect(screen.getByRole('textbox', { name: 'New name (optional)' })).toHaveAccessibleDescription(
      'Another place already has that name.',
    );
  });

  it('says when merging fails, and forgets a rejected key', async () => {
    const api = fakeAdminApi({ spots: places });
    api.mergeSpots.mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new ApiError(401));
    const { onKey } = renderPlaces(api);
    await screen.findByRole('list', { name: 'Places' });
    await tick('Porch');
    await tick('back steps');
    await userEvent.click(screen.getByRole('button', { name: 'Merge 2 places…' }));

    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t work. Try again.');
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(onKey).toHaveBeenCalledWith(null));
  });
});
