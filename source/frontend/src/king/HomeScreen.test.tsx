import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { at, CENTER, emptyStatus, event, NOW } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';

const noop = () => {};

describe('HomeScreen', () => {
  it('says King is hungry and not fed yet when nothing has been logged', () => {
    renderInEnglish(<HomeScreen status={emptyStatus} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('King is hungry');
    expect(screen.getByText('Not fed yet')).toBeInTheDocument();
    expect(screen.getByText('Not seen yet')).toBeInTheDocument();
  });

  it('says King is content and shows how long ago he was fed and seen', () => {
    const status = {
      lastFed: event({ id: 'f', kind: 'fed', occurredAt: at('2026-10-08T10:00:00Z').toISOString() }),
      lastSeen: event({ id: 's', kind: 'seen', occurredAt: at('2026-10-08T11:35:00Z').toISOString() }),
      recent: [],
    };

    renderInEnglish(<HomeScreen status={status} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('King is content');
    expect(screen.getByText('Fed 2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('Seen 25 minutes ago')).toBeInTheDocument();
    expect(screen.queryByText(/Fed & seen/)).not.toBeInTheDocument();
  });

  it('shows one “Fed & seen” chip when the latest sighting is the feeding itself', () => {
    const feeding = event({ id: 'f', kind: 'fed', occurredAt: at('2026-10-08T10:00:00Z').toISOString() });

    renderInEnglish(<HomeScreen status={{ lastFed: feeding, lastSeen: feeding, recent: [] }} now={NOW} onFed={noop} onSeen={noop} />);

    const chips = within(screen.getByRole('list', { name: 'King’s status' })).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent)).toEqual(['Fed & seen 2 hours ago']);
  });

  it('shows separate chips when food was left out after he was last seen', () => {
    const status = {
      lastFed: event({ id: 'f', kind: 'fed', sawKing: false, occurredAt: at('2026-10-08T11:00:00Z').toISOString() }),
      lastSeen: event({ id: 's', kind: 'seen', occurredAt: at('2026-10-08T09:00:00Z').toISOString() }),
      recent: [],
    };

    renderInEnglish(<HomeScreen status={status} now={NOW} onFed={noop} onSeen={noop} />);

    const chips = within(screen.getByRole('list', { name: 'King’s status' })).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent)).toEqual(['Fed 1 hour ago', 'Seen 3 hours ago']);
  });

  it('lists recent events newest first with who logged them', () => {
    const status = {
      ...emptyStatus,
      recent: [
        event({ id: 'a', kind: 'seen', reporterName: null, occurredAt: NOW.toISOString() }),
        event({ id: 'b', kind: 'fed', reporterName: 'Jamie', foods: ['wet', 'treats'], occurredAt: at('2026-10-07T12:00:00Z').toISOString() }),
      ],
    };

    renderInEnglish(<HomeScreen status={status} now={NOW} onFed={noop} onSeen={noop} />);

    const items = within(screen.getByRole('list', { name: 'Lately' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Seen by a neighbor');
    expect(items[0]).toHaveTextContent('just now');
    expect(items[1]).toHaveTextContent('Fed by Jamie');
    expect(items[1]).toHaveTextContent('Wet food and Treats');
    expect(items[1]).toHaveTextContent('1 day ago');
  });

  it('explains what the site is right on the home page', () => {
    renderInEnglish(<HomeScreen status={emptyStatus} now={NOW} onFed={noop} onSeen={noop} />);

    expect(
      screen.getByText(
        'A whimsical, neighborly way to keep track of King, the 11-year-old long-hair our neighborhood co-parents. Who saw him, where, and when he last ate.',
      ),
    ).toBeInTheDocument();
  });

  it('invites the first entry when nothing has been logged', () => {
    renderInEnglish(<HomeScreen status={emptyStatus} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByText('Nothing logged yet. Be the first!')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Lately' })).not.toBeInTheDocument();
  });

  it('calls back when the big buttons are pressed', async () => {
    const onFed = vi.fn();
    const onSeen = vi.fn();
    renderInEnglish(<HomeScreen status={emptyStatus} now={NOW} onFed={onFed} onSeen={onSeen} />);

    await userEvent.click(screen.getByRole('button', { name: 'I fed King' }));
    await userEvent.click(screen.getByRole('button', { name: 'I saw King' }));

    expect(onFed).toHaveBeenCalledOnce();
    expect(onSeen).toHaveBeenCalledOnce();
  });

  it('shows a photo of King with a text alternative', () => {
    renderInEnglish(<HomeScreen status={emptyStatus} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByRole('img', { name: /King/ })).toBeInTheDocument();
  });

  describe('map', () => {
    const porch = { latitude: 45.524, longitude: -122.676 };
    const corner = { latitude: 45.522, longitude: -122.678 };
    const mapRegion = () => screen.queryByRole('region', { name: 'Last fed & seen' });
    const legend = () =>
      within(screen.getByRole('list', { name: 'Map key' }))
        .getAllByRole('listitem')
        .map((item) => [item.textContent, item.querySelector('.legend-dot')?.classList.contains('legend-dot-fed') ? 'fed' : 'seen']);

    it('marks where King was last fed and last seen, when the site has a map', () => {
      const status = {
        lastFed: event({ id: 'f', kind: 'fed', sawKing: false, spotName: 'Porch', location: porch }),
        lastSeen: event({ id: 's', kind: 'seen', location: corner }),
        recent: [],
      };

      renderInEnglish(<HomeScreen status={status} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />);

      expect(mapRegion()!.querySelectorAll('.map-marker-fed')).toHaveLength(1);
      expect(mapRegion()!.querySelectorAll('.map-marker-seen')).toHaveLength(1);
    });

    it('says in words what it shows, with a key that names each marker', () => {
      const status = {
        lastFed: event({ id: 'f', kind: 'fed', sawKing: false, spotName: 'Porch', location: porch, occurredAt: at('2026-10-08T11:00:00Z').toISOString() }),
        lastSeen: event({ id: 's', kind: 'seen', location: corner, occurredAt: at('2026-10-08T09:00:00Z').toISOString() }),
        recent: [],
      };

      renderInEnglish(<HomeScreen status={status} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />);

      expect(screen.getByRole('heading', { name: 'Last fed & seen' })).toBeVisible();
      expect(mapRegion()).toBeInTheDocument();
      expect(legend()).toEqual([
        ['Fed 1 hour ago · at Porch', 'fed'],
        ['Seen 3 hours ago', 'seen'],
      ]);
    });

    it('keys one marker as “Fed & seen” when the feeding is also the last sighting', () => {
      const feeding = event({ id: 'f', kind: 'fed', spotName: 'Porch', location: porch, occurredAt: at('2026-10-08T10:00:00Z').toISOString() });

      renderInEnglish(
        <HomeScreen status={{ lastFed: feeding, lastSeen: feeding, recent: [] }} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />,
      );

      expect(legend()).toEqual([['Fed & seen 2 hours ago · at Porch', 'fed']]);
    });

    it('sits below the big buttons and above Lately', () => {
      const feeding = event({ id: 'f', kind: 'fed', location: porch });
      renderInEnglish(
        <HomeScreen status={{ lastFed: feeding, lastSeen: null, recent: [feeding] }} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />,
      );
      const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

      expect(follows(screen.getByRole('button', { name: 'I fed King' }), mapRegion()!)).toBe(true);
      expect(follows(mapRegion()!, screen.getByRole('heading', { name: 'Lately' }))).toBe(true);
      expect(follows(screen.getByRole('heading', { name: 'Last fed & seen' }), mapRegion()!)).toBe(true);
    });

    it('marks the spot once when the feeding is also the last sighting', () => {
      const feeding = event({ id: 'f', kind: 'fed', spotName: 'Porch', location: porch });

      renderInEnglish(
        <HomeScreen status={{ lastFed: feeding, lastSeen: feeding, recent: [] }} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />,
      );

      expect(mapRegion()!.querySelectorAll('.map-marker')).toHaveLength(1);
    });

    it('is left out when the site has no map, or nothing has a place yet', () => {
      const placed = { lastFed: event({ id: 'f', kind: 'fed', location: porch }), lastSeen: null, recent: [] };
      const { unmount } = renderInEnglish(<HomeScreen status={placed} mapCenter={null} now={NOW} onFed={noop} onSeen={noop} />);
      expect(mapRegion()).not.toBeInTheDocument();
      unmount();

      renderInEnglish(<HomeScreen status={emptyStatus} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />);
      expect(mapRegion()).not.toBeInTheDocument();
    });
  });

  it('says at which spot a feeding happened', () => {
    const status = { ...emptyStatus, recent: [event({ id: 'f', kind: 'fed', foods: ['wet'], spotName: 'Blue house steps' })] };

    renderInEnglish(<HomeScreen status={status} now={NOW} onFed={noop} onSeen={noop} />);

    const item = within(screen.getByRole('list', { name: 'Lately' })).getByRole('listitem');
    expect(item).toHaveTextContent('Wet food · at Blue house steps');
  });

  describe('near a spot', () => {
    const steps = { id: 'steps', name: 'Blue house steps', location: { latitude: 45.523, longitude: -122.677 } };
    const lately = () => within(screen.getByRole('list', { name: 'Lately' })).getAllByRole('listitem');

    it('says a sighting was near a saved spot within about a block', () => {
      const status = { ...emptyStatus, recent: [event({ kind: 'seen', location: { latitude: 45.524, longitude: -122.677 } })] };

      renderInEnglish(<HomeScreen status={status} spots={[steps]} now={NOW} onFed={noop} onSeen={noop} />);

      expect(lately()[0]).toHaveTextContent('near Blue house steps');
    });

    it('says nothing about a sighting far from every spot, or with no place', () => {
      const status = {
        ...emptyStatus,
        recent: [
          event({ id: 'far', kind: 'seen', location: { latitude: 45.53, longitude: -122.677 } }),
          event({ id: 'unplaced', kind: 'seen', location: null }),
        ],
      };

      renderInEnglish(<HomeScreen status={status} spots={[steps]} now={NOW} onFed={noop} onSeen={noop} />);

      expect(lately()[0]).not.toHaveTextContent('near');
      expect(lately()[1]).not.toHaveTextContent('near');
    });

    it('names a feeding’s own spot, never a nearby one', () => {
      const status = {
        ...emptyStatus,
        recent: [event({ kind: 'fed', spotName: 'Corner', location: steps.location })],
      };

      renderInEnglish(<HomeScreen status={status} spots={[steps]} now={NOW} onFed={noop} onSeen={noop} />);

      expect(lately()[0]).toHaveTextContent('at Corner');
      expect(lately()[0]).not.toHaveTextContent('near');
    });
  });
});
