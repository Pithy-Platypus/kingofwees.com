import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { ApiError, type KingEventView, type KingStatus } from './king/api';
import { emptyStatus, event, fakeApi, NOW } from './test/fakeApi';
import { renderInEnglish } from './test/render';

const KEY = 'device-key';
const renderApp = (api = fakeApi()) => {
  renderInEnglish(<App api={api} reporterKey={KEY} now={() => NOW} />);
  return api;
};

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
        <App api={fakeApi({ ...emptyStatus, lastFed: event({ kind: 'fed' }) })} reporterKey={KEY} now={() => clock} />,
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

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: ['dry', 'treats'] });
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

    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: [] });
  });

  it('can go back home from the food choice without logging', async () => {
    const api = renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('button', { name: 'I saw King' })).toBeInTheDocument();
    expect(api.logFeeding).not.toHaveBeenCalled();
  });

  it('logs a sighting in one tap and thanks the spotter', async () => {
    const api = renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));

    expect(api.logSighting).toHaveBeenCalledWith({ reporterKey: KEY });
    expect(await screen.findByRole('heading', { name: 'Thanks for spotting King!' })).toBeInTheDocument();
  });

  it('undoes the entry just logged with this device key and returns home', async () => {
    const api = renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));

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

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('too late to undo');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));

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
    expect(api.logFeeding).toHaveBeenCalledWith({ reporterKey: KEY, foods: ['dry'] });
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

  it('logs one feeding even when Log feeding is double-tapped', async () => {
    const api = fakeApi();
    api.logFeeding.mockReturnValue(new Promise<KingEventView>(() => {}));
    renderApp(api);
    await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));

    await userEvent.dblClick(screen.getByRole('button', { name: 'Log feeding' }));

    expect(api.logFeeding).toHaveBeenCalledOnce();
  });

  it('logs one sighting even when I saw King is double-tapped', async () => {
    const api = fakeApi();
    api.logSighting.mockReturnValue(new Promise<KingEventView>(() => {}));
    renderApp(api);

    await userEvent.dblClick(await screen.findByRole('button', { name: 'I saw King' }));

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
});
