import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
import { HomeScreen } from './HomeScreen';
import { at, CENTER, emptyStatus, event, NOW, photo } from '../test/fakeApi';
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
      recent: [], latestPhoto: null,
    };

    renderInEnglish(<HomeScreen status={status} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('King is content');
    expect(screen.getByText('Fed 2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('Seen 25 minutes ago')).toBeInTheDocument();
    expect(screen.queryByText(/Fed & seen/)).not.toBeInTheDocument();
  });

  it('shows one “Fed & seen” chip when the latest sighting is the feeding itself', () => {
    const feeding = event({ id: 'f', kind: 'fed', occurredAt: at('2026-10-08T10:00:00Z').toISOString() });

    renderInEnglish(<HomeScreen status={{ lastFed: feeding, lastSeen: feeding, recent: [], latestPhoto: null }} now={NOW} onFed={noop} onSeen={noop} />);

    const chips = within(screen.getByRole('list', { name: 'King’s status' })).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent)).toEqual(['Fed & seen 2 hours ago']);
  });

  it('shows separate chips when food was left out after he was last seen', () => {
    const status = {
      lastFed: event({ id: 'f', kind: 'fed', sawKing: false, occurredAt: at('2026-10-08T11:00:00Z').toISOString() }),
      lastSeen: event({ id: 's', kind: 'seen', occurredAt: at('2026-10-08T09:00:00Z').toISOString() }),
      recent: [], latestPhoto: null,
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
    // The map loads on demand, so wait for it; absence is checked on the section's heading, which renders at once.
    const loadedMap = () => screen.findByRole('region', { name: 'Last fed & seen' });
    const mapSection = () => screen.queryByRole('heading', { name: 'Last fed & seen' });
    const legend = () =>
      within(screen.getByRole('list', { name: 'Map key' }))
        .getAllByRole('listitem')
        .map((item) => [item.textContent, item.querySelector('.legend-dot')?.classList.contains('legend-dot-fed') ? 'fed' : 'seen']);

    it('marks where King was last fed and last seen, when the site has a map', async () => {
      const status = {
        lastFed: event({ id: 'f', kind: 'fed', sawKing: false, spotName: 'Porch', location: porch }),
        lastSeen: event({ id: 's', kind: 'seen', location: corner }),
        recent: [], latestPhoto: null,
      };

      renderInEnglish(<HomeScreen status={status} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />);

      const map = await loadedMap();
      expect(map.querySelectorAll('.map-marker-fed')).toHaveLength(1);
      expect(map.querySelectorAll('.map-marker-seen')).toHaveLength(1);
    });

    it('says in words what it shows, with a key that names each marker', async () => {
      const status = {
        lastFed: event({ id: 'f', kind: 'fed', sawKing: false, spotName: 'Porch', location: porch, occurredAt: at('2026-10-08T11:00:00Z').toISOString() }),
        lastSeen: event({ id: 's', kind: 'seen', location: corner, occurredAt: at('2026-10-08T09:00:00Z').toISOString() }),
        recent: [], latestPhoto: null,
      };

      renderInEnglish(<HomeScreen status={status} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />);

      expect(screen.getByRole('heading', { name: 'Last fed & seen' })).toBeVisible();
      expect(await loadedMap()).toBeInTheDocument();
      expect(legend()).toEqual([
        ['Fed 1 hour ago · at Porch', 'fed'],
        ['Seen 3 hours ago', 'seen'],
      ]);
    });

    it('keys one marker as “Fed & seen” when the feeding is also the last sighting', () => {
      const feeding = event({ id: 'f', kind: 'fed', spotName: 'Porch', location: porch, occurredAt: at('2026-10-08T10:00:00Z').toISOString() });

      renderInEnglish(
        <HomeScreen status={{ lastFed: feeding, lastSeen: feeding, recent: [], latestPhoto: null }} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />,
      );

      expect(legend()).toEqual([['Fed & seen 2 hours ago · at Porch', 'fed']]);
    });

    it('sits below the big buttons and above Lately', async () => {
      const feeding = event({ id: 'f', kind: 'fed', location: porch });
      renderInEnglish(
        <HomeScreen status={{ lastFed: feeding, lastSeen: null, recent: [feeding], latestPhoto: null }} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />,
      );
      const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

      const map = await loadedMap();
      expect(follows(screen.getByRole('button', { name: 'I fed King' }), map)).toBe(true);
      expect(follows(map, screen.getByRole('heading', { name: 'Lately' }))).toBe(true);
      expect(follows(screen.getByRole('heading', { name: 'Last fed & seen' }), map)).toBe(true);
    });

    it('marks the spot once when the feeding is also the last sighting', async () => {
      const feeding = event({ id: 'f', kind: 'fed', spotName: 'Porch', location: porch });

      renderInEnglish(
        <HomeScreen status={{ lastFed: feeding, lastSeen: feeding, recent: [], latestPhoto: null }} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />,
      );

      expect((await loadedMap()).querySelectorAll('.map-marker')).toHaveLength(1);
    });

    it('is left out when the site has no map, or nothing has a place yet', () => {
      const placed = { lastFed: event({ id: 'f', kind: 'fed', location: porch }), lastSeen: null, recent: [], latestPhoto: null };
      const { unmount } = renderInEnglish(<HomeScreen status={placed} mapCenter={null} now={NOW} onFed={noop} onSeen={noop} />);
      expect(mapSection()).not.toBeInTheDocument();
      unmount();

      renderInEnglish(<HomeScreen status={emptyStatus} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />);
      expect(mapSection()).not.toBeInTheDocument();
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

describe('HomeScreen — photos', () => {
  const sighting = event({ id: 's', kind: 'seen', occurredAt: new Date('2026-10-08T11:30:00').toISOString(), reporterName: 'Sarah', photoId: 'p1' });

  it('shows a line’s photo as a thumbnail that opens the full size, described like the line', () => {
    renderInEnglish(<HomeScreen status={{ ...emptyStatus, recent: [sighting] }} now={NOW} onFed={noop} onSeen={noop} />);

    const item = within(screen.getByRole('list', { name: 'Lately' })).getByRole('listitem');
    const link = within(item).getByRole('link', { name: 'Photo from a sighting by Sarah, Oct 8, 2026, 11:30 AM' });
    expect(link).toHaveAttribute('href', '/api/king/photos/p1/full');
    expect(within(link).getByRole('img')).toHaveAttribute('src', '/api/king/photos/p1/thumb');
    // Alt text is never shown on hover; the title is, on devices that hover.
    expect(within(link).getByRole('img')).toHaveAttribute('title', 'Photo from a sighting by Sarah, Oct 8, 2026, 11:30 AM');
  });

  it('shows no thumbnail on a line without a photo', () => {
    renderInEnglish(<HomeScreen status={{ ...emptyStatus, recent: [{ ...sighting, photoId: null }] }} now={NOW} onFed={noop} onSeen={noop} />);

    expect(within(screen.getByRole('list', { name: 'Lately' })).queryByRole('img')).not.toBeInTheDocument();
  });

  it('crowns the newest photo as King’s avatar, described by how it was added', () => {
    const latestPhoto = photo({ id: 'p9', postedAt: new Date('2026-10-07T09:00:00').toISOString(), reporterName: 'Kael' });

    renderInEnglish(<HomeScreen status={{ ...emptyStatus, latestPhoto }} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByRole('img', { name: 'Photo shared by Kael on Oct 7, 2026' })).toHaveAttribute('src', '/api/king/photos/p9/thumb');
    expect(screen.getByRole('img', { name: 'Photo shared by Kael on Oct 7, 2026' })).toHaveAttribute('title', 'Photo shared by Kael on Oct 7, 2026');
    expect(screen.queryByRole('img', { name: 'King, a fluffy grey long-haired cat' })).not.toBeInTheDocument();
  });

  it('keeps today’s picture of King until there is a photo', () => {
    renderInEnglish(<HomeScreen status={emptyStatus} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByRole('img', { name: 'King, a fluffy grey long-haired cat' })).toHaveAttribute('src', '/king/king-avatar.jpg');
  });

  it('links to every photo under Lately', () => {
    renderInEnglish(<HomeScreen status={emptyStatus} now={NOW} onFed={noop} onSeen={noop} />);

    expect(screen.getByRole('link', { name: 'See every photo' })).toHaveAttribute('href', '/photos');
  });
});

describe('HomeScreen — the “Last fed & seen” map', () => {
  it('stays on the last feeding and sighting: zoom only, no dragging', async () => {
    const create = vi.spyOn(L, 'map');
    const feeding = event({ id: 'f', kind: 'fed', location: CENTER });

    renderInEnglish(<HomeScreen status={{ ...emptyStatus, lastFed: feeding, recent: [feeding] }} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />);
    await screen.findByRole('region', { name: 'Last fed & seen' });

    const map = create.mock.results[0].value as L.Map;
    expect(map.dragging.enabled()).toBe(false);
    expect(map.options.scrollWheelZoom).toBe('center');
    create.mockRestore();
  });
});
