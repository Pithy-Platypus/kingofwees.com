import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { at, emptyStatus, event, NOW } from '../test/fakeApi';
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
        'A whimsical, neighborly way to keep track of King, the 11-year-old long-hair our street co-parents. Who saw him, where, and when he last ate.',
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
});
