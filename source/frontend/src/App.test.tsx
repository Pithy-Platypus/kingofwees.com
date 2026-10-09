import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { ApiError, type KingEventView, type KingStatus } from './king/api';
import { loadNickname, saveNickname } from './king/reporter';
import { CENTER, emptyStatus, event, fakeApi, NOW, spot } from './test/fakeApi';
import { fakeGeolocation } from './test/fakeGeolocation';
import { memoryStorage } from './test/memoryStorage';
import { renderInEnglish } from './test/render';

const KEY = 'device-key';

// A device that has already answered (skipped) the name question, so flows go straight to logging.
const deviceNamed = (name: string) => {
  const storage = memoryStorage();
  saveNickname(storage, name);
  return storage;
};

const renderApp = (api = fakeApi(), storage = deviceNamed('')) => {
  renderInEnglish(<App api={api} reporterKey={KEY} storage={storage} now={() => NOW} />);
  return api;
};

const nameQuestion = () => screen.queryByRole('heading', { name: 'What should neighbors call you?' });

// After "I saw King" comes "Where is King?"; "Log without a place" logs the sighting with no place.
const skipWhere = async () => {
  await screen.findByRole('heading', { name: 'Where is King?' });
  await userEvent.click(screen.getByRole('button', { name: 'Log without a place' }));
};
// Moves a picking map as a tap well off its center would: the map re-centers there, under the pin.
const moveMap = (name: string) =>
  fireEvent.click(screen.getByRole('region', { name }).querySelector('.leaflet-container')!, { clientX: 120, clientY: 80 });
const anyPlace = { latitude: expect.any(Number), longitude: expect.any(Number) };
const nameBox = () => screen.getByRole('textbox', { name: 'Your first name or nickname' });

describe('App', () => {
  it('shows a loading message, not an error, while the first status loads', () => {
    renderApp();

    expect(screen.getByRole('status')).toHaveTextContent('Finding King');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps “how long ago” moving while the page stays open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let clock = NOW;
      renderInEnglish(
        <App
          api={fakeApi({ ...emptyStatus, lastFed: event({ kind: 'fed' }) })}
          reporterKey={KEY}
          storage={deviceNamed('')}
          now={() => clock}
        />,
      );
      expect(await screen.findByText('Fed just now')).toBeInTheDocument();

      clock = new Date(NOW.getTime() + 2 * 60_000);
      await act(() => vi.advanceTimersByTimeAsync(30_000));

      expect(screen.getByText('Fed 2 minutes ago')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves focus to the heading of each new screen for keyboard and screen-reader users', async () => {
    renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    expect(screen.getByRole('heading', { name: 'What did King eat?' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    expect(await screen.findByRole('heading', { name: 'Feast logged!' })).toHaveFocus();
  });

  it('loads the status on start', async () => {
    const api = renderApp(fakeApi({ ...emptyStatus, lastFed: event({ kind: 'fed' }) }));

    expect(await screen.findByText('Fed just now')).toBeInTheDocument();
    expect(api.getStatus).toHaveBeenCalledOnce();
  });

  it('logs a feeding with every food that was picked', async () => {
    const api = renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    await userEvent.click(screen.getByRole('button', { name: 'Treats' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dry food' }));
    expect(screen.getByRole('button', { name: 'Dry food' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Wet food' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: ['dry', 'treats'], sawKing: true });
    expect(await screen.findByRole('heading', { name: 'Feast logged!' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('button', { name: 'I fed King' })).toBeInTheDocument();
    expect(api.getStatus).toHaveBeenCalledTimes(2);
  });

  it('goes home only once the fresh status has arrived, never showing the stale one', async () => {
    const api = renderApp();
    let deliverFresh!: (status: KingStatus) => void;
    api.getStatus.mockReturnValueOnce(new Promise<KingStatus>((resolve) => (deliverFresh = resolve)));
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Done' }));

    expect(screen.queryByText('Not fed yet')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Feast logged!' })).toBeInTheDocument();
    await act(async () => deliverFresh({ ...emptyStatus, lastFed: event({ kind: 'fed' }) }));
    expect(await screen.findByText('Fed just now')).toBeInTheDocument();
  });

  it('logs a feeding with no foods when the feeder is not sure, and a second tap un-picks a food', async () => {
    const api = renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    await userEvent.click(screen.getByRole('button', { name: 'Wet food' }));
    await userEvent.click(screen.getByRole('button', { name: 'Wet food' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: [], sawKing: true });
  });

  it('can go back home from the food choice without logging', async () => {
    const api = renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('button', { name: 'I saw King' })).toBeInTheDocument();
    expect(api.logFeeding).not.toHaveBeenCalled();
  });

  it('logs a sighting and thanks the spotter', async () => {
    const api = renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();

    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY });
    expect(await screen.findByRole('heading', { name: 'Thanks for spotting King!' })).toBeInTheDocument();
  });

  it('undoes the entry just logged with this device key and returns home', async () => {
    const api = renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(api.undo).toHaveBeenCalledWith('new-seen', KEY);
    expect(await screen.findByRole('button', { name: 'I saw King' })).toBeInTheDocument();
    expect(api.getStatus).toHaveBeenCalledTimes(2);
  });

  it('explains when it is too late to undo', async () => {
    const api = fakeApi();
    api.undo.mockRejectedValue(new ApiError(409));
    renderApp(api);
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('too late to undo');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();

    expect(await screen.findByRole('heading', { name: 'Thanks for spotting King!' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un-picking one food keeps the others, and picked foods show a check mark', async () => {
    const api = renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    const wet = screen.getByRole('button', { name: 'Wet food' });
    const dry = screen.getByRole('button', { name: 'Dry food' });

    await userEvent.click(wet);
    await userEvent.click(dry);
    await userEvent.click(wet);

    expect(dry.querySelector('svg')).not.toBeNull();
    expect(wet.querySelector('svg')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: ['dry'], sawKing: true });
  });

  it('keeps the footer off the feeding and confirmation screens so the flow stays focused', async () => {
    renderApp();
    expect(await screen.findByRole('contentinfo')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    await screen.findByRole('heading', { name: 'Feast logged!' });
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('keeps the footer off the name, spot and “Where is King?” screens too', async () => {
    renderApp(fakeApi(), memoryStorage());

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    expect(nameQuestion()).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Somewhere new' }));
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await screen.findByRole('heading', { name: 'Where is King?' });
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('still logs a feeding, with no spot, when the spots can’t be loaded', async () => {
    const api = fakeApi();
    api.listSpots.mockRejectedValue(new ApiError(503));
    renderApp(api);

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    expect(within(screen.getByRole('group', { name: 'Where did you feed him?' })).getAllByRole('radio')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: [], sawKing: true });
  });

  it('logs one feeding even when Log feeding is double-tapped', async () => {
    const api = fakeApi();
    api.logFeeding.mockReturnValue(new Promise<KingEventView>(() => {}));
    renderApp(api);
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));

    await userEvent.dblClick(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledOnce();
  });

  it('logs one sighting even when “Log without a place” is double-tapped', async () => {
    const api = fakeApi();
    api.logSighting.mockReturnValue(new Promise<KingEventView>(() => {}));
    renderApp(api);
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));

    await userEvent.dblClick(await screen.findByRole('button', { name: 'Log without a place' }));

    expect(api.logSighting).toHaveBeenCalledOnce();
  });

  it('tells the user when King’s tracker cannot be reached, and can try again', async () => {
    const api = fakeApi();
    api.getStatus.mockRejectedValueOnce(new ApiError(503));
    renderApp(api);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t reach');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(api.getStatus).toHaveBeenCalledTimes(2);
  });

  it('counts a feeding as seeing him unless “I left food out” is ticked, which starts unticked', async () => {
    const api = renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    const leftOut = screen.getByRole('checkbox', { name: 'I left food out (didn’t see him)' });
    expect(leftOut).not.toBeChecked();

    await userEvent.click(leftOut);
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: [], sawKing: false });
  });
});

describe('App — who fed', () => {
  it('asks a new device what neighbors should call it before the first feeding, then logs with that name', async () => {
    const storage = memoryStorage();
    const api = renderApp(fakeApi(), storage);

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    expect(nameQuestion()).toHaveFocus();
    await userEvent.type(nameBox(), 'Sunny');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('heading', { name: 'What did King eat?' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, reporterName: 'Sunny', foods: [], sawKing: true });
    expect(await screen.findByText(/Logging as Sunny/)).toBeInTheDocument();
    expect(loadNickname(storage)).toBe('Sunny');
  });

  it('Skip logs the sighting without a name, says so, and never asks this device again', async () => {
    const storage = memoryStorage();
    const api = renderApp(fakeApi(), storage);

    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    expect(api.logSighting).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await skipWhere();

    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY });
    expect(await screen.findByText(/Logging as a neighbor/)).toBeInTheDocument();
    expect(loadNickname(storage)).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    expect(nameQuestion()).not.toBeInTheDocument();
    await skipWhere();
    expect(api.logSighting).toHaveBeenCalledTimes(2);
  });

  it('saving an empty name is the same as skipping', async () => {
    const api = renderApp(fakeApi(), memoryStorage());

    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await userEvent.type(nameBox(), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await skipWhere();

    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY });
  });

  it('uses the name remembered from an earlier visit without asking', async () => {
    const api = renderApp(fakeApi(), deviceNamed('Sunny'));

    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));

    expect(nameQuestion()).not.toBeInTheDocument();
    await skipWhere();
    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY, reporterName: 'Sunny' });
  });

  it('“change” on the confirmation renames the entry just logged and later ones, then comes back to the confirmation', async () => {
    const storage = deviceNamed('Sunny');
    const api = renderApp(fakeApi(), storage);
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();

    await userEvent.click(await screen.findByRole('button', { name: 'change' }));
    expect(nameBox()).toHaveValue('Sunny');
    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), 'Captain Whiskers');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Thanks for spotting King!' })).toHaveFocus();
    expect(api.renameEvent).toHaveBeenCalledWith('new-seen', KEY, 'Captain Whiskers');
    expect(screen.getByText(/Logging as Captain Whiskers/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(loadNickname(storage)).toBe('Captain Whiskers');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();
    expect(api.logSighting).toHaveBeenLastCalledWith({ reporterKey: KEY, reporterName: 'Captain Whiskers' });
  });

  it('“change” to no name makes the entry just logged a neighbor’s', async () => {
    const api = renderApp(fakeApi(), deviceNamed('Sunny'));
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();

    await userEvent.click(await screen.findByRole('button', { name: 'change' }));
    await userEvent.clear(nameBox());
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Logging as a neighbor/)).toBeInTheDocument();
    expect(api.renameEvent).toHaveBeenCalledWith('new-seen', KEY, null);
  });

  it('says so when the entry just logged can’t be renamed, and still uses the name from now on', async () => {
    const storage = deviceNamed('Sunny');
    const api = fakeApi();
    api.renameEvent.mockRejectedValueOnce(new Error('too late'));
    renderApp(api, storage);
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();

    await userEvent.click(await screen.findByRole('button', { name: 'change' }));
    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), 'Kael');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t change the name on this entry. Your next entries will use the new name.',
    );
    expect(loadNickname(storage)).toBe('Kael');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    await skipWhere();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps names within the 40 characters the server accepts', async () => {
    renderApp(fakeApi(), memoryStorage());

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));

    expect(nameBox()).toHaveAttribute('maxLength', '40');
  });
});

describe('App — where he was seen', () => {
  const near = { latitude: 45.523456, longitude: -122.676543 };

  const renderSeen = (world: Parameters<typeof fakeApi>[1], geolocation = fakeGeolocation(near)) => {
    const api = fakeApi(emptyStatus, world);
    renderInEnglish(
      <App api={api} reporterKey={KEY} storage={deviceNamed('')} geolocation={geolocation} now={() => NOW} />,
    );
    return api;
  };

  const startSighting = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
    expect(screen.getByRole('heading', { name: 'Where is King?' })).toHaveFocus();
  };

  it('“Log without a place” logs the sighting with no place', async () => {
    const api = renderSeen({ map: CENTER });
    await startSighting();

    await userEvent.click(screen.getByRole('button', { name: 'Log without a place' }));

    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY });
    expect(await screen.findByRole('heading', { name: 'Thanks for spotting King!' })).toBeInTheDocument();
  });

  it('“I’m near him now” logs where this device is', async () => {
    const api = renderSeen({ map: CENTER });
    await startSighting();

    await userEvent.click(screen.getByRole('button', { name: 'I’m near him now' }));

    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY, location: near });
  });

  it('says so when the location is refused, and still offers the map and logging without a place', async () => {
    const api = renderSeen({ map: CENTER }, fakeGeolocation('denied'));
    await startSighting();

    await userEvent.click(screen.getByRole('button', { name: 'I’m near him now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t get your location');
    expect(api.logSighting).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Map of where you saw King' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log without a place' })).toBeInTheDocument();
  });

  it('says how to pick a place: move the map so the pin is on the spot', async () => {
    renderSeen({ map: CENTER });
    await startSighting();

    expect(
      screen.getByRole('region', { name: 'Map of where you saw King', description: 'Or move the map so the pin is where you saw him.' }),
    ).toBeInTheDocument();
  });

  it('offers “Log sighting here” only once the map is moved, and logs the place under the pin', async () => {
    const api = renderSeen({ map: CENTER });
    await startSighting();
    expect(screen.queryByRole('button', { name: 'Log sighting here' })).not.toBeInTheDocument();

    moveMap('Map of where you saw King');
    expect(api.logSighting).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Log sighting here' }));

    const { location } = api.logSighting.mock.lastCall![0];
    expect(location).toEqual(anyPlace);
    expect(location).not.toEqual(CENTER);
  });

  it('offers “By {spot}” for each spot, which logs the sighting at the spot', async () => {
    const porch = { id: 'porch', name: 'Porch', location: { latitude: 45.524, longitude: -122.676 } };
    const api = renderSeen({ map: CENTER, spots: [porch, spot('corner', 'Corner')] });
    await startSighting();

    const tiles = within(screen.getByRole('list', { name: 'Spots' })).getAllByRole('button').map((b) => b.textContent);
    expect(tiles).toEqual(['By Corner', 'By Porch']);
    await userEvent.click(screen.getByRole('button', { name: 'By Porch' }));

    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY, location: porch.location });
  });

  it('offers no spot list when there are no spots', async () => {
    renderSeen({ map: CENTER });
    await startSighting();

    expect(screen.queryByRole('list', { name: 'Spots' })).not.toBeInTheDocument();
  });

  it('offers only “I’m near him now” and logging without a place when the site has no map', async () => {
    renderSeen({ map: null });
    await startSighting();

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I’m near him now' })).toBeInTheDocument();
  });

  it('can go back home without logging', async () => {
    const api = renderSeen({ map: CENTER });
    await startSighting();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('button', { name: 'I saw King' })).toBeInTheDocument();
    expect(api.logSighting).not.toHaveBeenCalled();
  });
});

describe('App — feeding spots', () => {
  const spots = [spot('corner', 'Corner'), spot('steps', 'Blue house steps')];

  const renderFeed = async (storage = deviceNamed(''), geolocation = fakeGeolocation({ latitude: 45.52, longitude: -122.68 })) => {
    const api = fakeApi(emptyStatus, { map: CENTER, spots });
    renderInEnglish(<App api={api} reporterKey={KEY} storage={storage} geolocation={geolocation} now={() => NOW} />);
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    return api;
  };

  const where = () => screen.getByRole('group', { name: 'Where did you feed him?' });
  const choices = () => within(where()).getAllByRole('radio').map((r) => r.closest('label')!.textContent);

  it('asks where on the feeding screen itself, opening on “No spot” on first use', async () => {
    const api = await renderFeed();

    expect(within(where()).getByRole('radio', { name: 'No spot' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: [], sawKing: true });
  });

  it('offers every spot by name, then “No spot”, and logs at the one picked', async () => {
    const api = await renderFeed();

    expect(choices()).toEqual(['Blue house steps', 'Corner', 'No spot']);
    await userEvent.click(screen.getByRole('radio', { name: 'Corner' }));

    expect(screen.getByRole('radio', { name: 'Corner' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'No spot' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: [], sawKing: true, spotId: 'corner' });
  });

  it('opens on the last spot used on this device next time', async () => {
    const storage = deviceNamed('');
    const first = await renderFeed(storage);
    await userEvent.click(screen.getByRole('radio', { name: 'Corner' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    expect(first.logFeeding).toHaveBeenCalled();
    cleanup();

    const second = await renderFeed(storage);

    expect(screen.getByRole('radio', { name: 'Corner' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    expect(second.logFeeding).toHaveBeenCalledWith(expect.objectContaining({ spotId: 'corner' }));
  });

  it('“No spot” clears the picked spot', async () => {
    const api = await renderFeed();
    await userEvent.click(screen.getByRole('radio', { name: 'Corner' }));

    await userEvent.click(screen.getByRole('radio', { name: 'No spot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: [], sawKing: true });
  });

  it('adds somewhere new with a name and a place on the map, then feeds there, keeping the foods picked', async () => {
    const api = await renderFeed();
    await userEvent.click(screen.getByRole('button', { name: 'Wet food' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'I left food out (didn’t see him)' }));

    await userEvent.click(within(where()).getByRole('button', { name: 'Somewhere new' }));
    expect(screen.getByRole('heading', { name: 'Add a feeding spot' })).toHaveFocus();
    await userEvent.type(screen.getByRole('textbox', { name: 'Name this spot' }), 'Garden gate');
    expect(
      screen.getByRole('region', { name: 'Map of where you fed King', description: 'Move the map so the pin is where you fed him.' }),
    ).toBeInTheDocument();
    moveMap('Map of where you fed King');
    await userEvent.click(screen.getByRole('button', { name: 'Save spot' }));

    expect(api.addSpot).toHaveBeenCalledWith({ reporterKey: KEY, name: 'Garden gate', location: anyPlace });
    expect(await screen.findByRole('radio', { name: 'Garden gate' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Wet food' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: ['wet'], sawKing: false, spotId: 'new-spot' });
  });

  it('can place somewhere new where the device is', async () => {
    const api = await renderFeed(deviceNamed(''), fakeGeolocation({ latitude: 45.52, longitude: -122.68 }));
    await userEvent.click(screen.getByRole('button', { name: 'Somewhere new' }));

    await userEvent.type(screen.getByRole('textbox', { name: 'Name this spot' }), 'Porch');
    await userEvent.click(screen.getByRole('button', { name: 'Use where I am' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save spot' }));

    expect(api.addSpot).toHaveBeenCalledWith({ reporterKey: KEY, name: 'Porch', location: { latitude: 45.52, longitude: -122.68 } });
  });

  it('asks for both a name and a place before saving somewhere new', async () => {
    const api = await renderFeed();
    await userEvent.click(screen.getByRole('button', { name: 'Somewhere new' }));

    await userEvent.type(screen.getByRole('textbox', { name: 'Name this spot' }), 'Porch');
    await userEvent.click(screen.getByRole('button', { name: 'Save spot' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Give the spot a name and move the map to its place.');
    expect(api.addSpot).not.toHaveBeenCalled();
  });

  it('keeps spot names within the 40 characters the server accepts', async () => {
    await renderFeed();
    await userEvent.click(screen.getByRole('button', { name: 'Somewhere new' }));

    expect(screen.getByRole('textbox', { name: 'Name this spot' })).toHaveAttribute('maxLength', '40');
  });

  it('Back from “Somewhere new” returns to the feeding without changing the spot', async () => {
    await renderFeed();
    await userEvent.click(screen.getByRole('radio', { name: 'Corner' }));
    await userEvent.click(screen.getByRole('button', { name: 'Somewhere new' }));

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('heading', { name: 'What did King eat?' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Corner' })).toBeChecked();
  });

  it('starts the next feeding with no foods picked', async () => {
    await renderFeed();
    await userEvent.click(screen.getByRole('button', { name: 'Wet food' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));

    expect(screen.getByRole('button', { name: 'Wet food' })).toHaveAttribute('aria-pressed', 'false');
  });
});
