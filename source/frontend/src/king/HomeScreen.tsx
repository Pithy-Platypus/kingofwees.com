import { useMemo } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import type { KingEventView, KingStatus, SpotView } from './api';
import { BowlIcon, CrownIcon, EyeIcon } from './icons';
import { ActivityItem } from './ActivityItem';
import type { GeoPoint } from './location';
import { Link } from '../routing/Link';
import { MapView, type MapMarker } from './MapView';
import { common, formatWhen, placeOf } from './messages';
import { kingMood } from './time';

// Placeholder types are declared so a missing or misspelled {value} fails the type-check.
type Values = {
  tagline: NoMessageValues;
  photoAlt: NoMessageValues;
  content: NoMessageValues;
  contentDetail: NoMessageValues;
  hungry: NoMessageValues;
  hungryDetail: NoMessageValues;
  statusChips: NoMessageValues;
  fedAgo: { when: string };
  fedAndSeenAgo: { when: string };
  notFed: NoMessageValues;
  seenAgo: { when: string };
  notSeen: NoMessageValues;
  iSaw: NoMessageValues;
  iFed: NoMessageValues;
  lately: NoMessageValues;
  seeHistory: NoMessageValues;
  nothingYet: NoMessageValues;
  mapTitle: NoMessageValues;
  mapKey: NoMessageValues;
};

const m = defineMessages<Values>({
  tagline: {
    id: 'home.tagline',
    defaultMessage:
      'A whimsical, neighborly way to keep track of King, the 11-year-old long-hair our neighborhood co-parents. Who saw him, where, and when he last ate.',
    description: 'One-line explanation of the site under the header on the home page',
  },
  photoAlt: { id: 'home.photoAlt', defaultMessage: 'King, a fluffy grey long-haired cat', description: 'Alt text for King’s photo' },
  content: { id: 'home.mood.content', defaultMessage: 'King is content', description: 'Heading when King was fed recently' },
  contentDetail: { id: 'home.mood.contentDetail', defaultMessage: 'His Majesty is satisfied.', description: 'Playful royal line under the content heading' },
  hungry: { id: 'home.mood.hungry', defaultMessage: 'King is hungry', description: 'Heading when King has not been fed for over 12 hours' },
  hungryDetail: { id: 'home.mood.hungryDetail', defaultMessage: 'His Majesty awaits a feast.', description: 'Playful royal line under the hungry heading' },
  statusChips: { id: 'home.statusChips', defaultMessage: 'King’s status', description: 'Accessible name for the fed/seen chips' },
  fedAgo: { id: 'home.fedAgo', defaultMessage: 'Fed {when}', description: 'Chip; {when} is e.g. “2 hours ago” or “just now”' },
  fedAndSeenAgo: {
    id: 'home.fedAndSeenAgo',
    defaultMessage: 'Fed & seen {when}',
    description: 'Single chip when the last feeding is also the last time King was seen; {when} is e.g. “2 hours ago”',
  },
  notFed: { id: 'home.notFed', defaultMessage: 'Not fed yet', description: 'Chip when no feeding has been logged' },
  seenAgo: { id: 'home.seenAgo', defaultMessage: 'Seen {when}', description: 'Chip; {when} is e.g. “25 minutes ago”' },
  notSeen: { id: 'home.notSeen', defaultMessage: 'Not seen yet', description: 'Chip when no sighting has been logged' },
  iSaw: { id: 'home.iSawKing', defaultMessage: 'I saw King', description: 'Big button to log a sighting' },
  iFed: { id: 'home.iFedKing', defaultMessage: 'I fed King', description: 'Big button to log a feeding' },
  lately: { id: 'home.lately', defaultMessage: 'Lately', description: 'Heading over the recent activity list' },
  seeHistory: {
    id: 'home.seeHistory',
    defaultMessage: 'See King’s history',
    description: 'Link under the recent activity list to the history page (heat map and every entry)',
  },
  nothingYet: { id: 'home.nothingYet', defaultMessage: 'Nothing logged yet. Be the first!', description: 'Shown when the activity list is empty' },
  mapTitle: {
    id: 'home.mapTitle',
    defaultMessage: 'Last fed & seen',
    description: 'Heading over the small home map, which shows only the latest feeding and sighting',
  },
  mapKey: { id: 'home.mapKey', defaultMessage: 'Map key', description: 'Accessible name of the list explaining the map’s markers' },
});

type Props = {
  status: KingStatus;
  spots?: SpotView[];
  mapCenter?: GeoPoint | null;
  now: Date;
  busy?: boolean;
  onFed: () => void;
  onSeen: () => void;
};

type Placed = { marker: MapMarker; event: KingEventView; fedAndSeen: boolean };

// The last feeding's spot, and the last sighting when it is a different entry. Feeds both the markers and their key.
function placedFor({ lastFed, lastSeen }: KingStatus): Placed[] {
  const placed: Placed[] = [];
  const same = lastFed !== null && lastSeen?.id === lastFed.id;
  if (lastFed?.location) placed.push({ marker: { point: lastFed.location, kind: 'fed' }, event: lastFed, fedAndSeen: same });
  if (lastSeen?.location && !same) placed.push({ marker: { point: lastSeen.location, kind: 'seen' }, event: lastSeen, fedAndSeen: false });
  return placed;
}

export function HomeScreen({ status, spots = [], mapCenter = null, now, busy = false, onFed, onSeen }: Props) {
  const intl = useIntl();
  const hungry = kingMood(status.lastFed && new Date(status.lastFed.occurredAt), now) === 'hungry';
  const when = (e: KingEventView) => formatWhen(intl, new Date(e.occurredAt), now);
  // The server's lastSeen can be the feeding itself (a feeder sees him); then one chip says both.
  const fedAndSeen = status.lastFed !== null && status.lastSeen?.id === status.lastFed.id;
  const fedChipClass = `status-chip ${hungry ? 'badge-error' : 'badge-success'}`;
  const placed = useMemo(() => placedFor(status), [status]);
  const markers = useMemo(() => placed.map((p) => p.marker), [placed]);
  // Words for each marker, so the map never relies on color alone (WCAG 1.4.1).
  const keyOf = ({ event, marker, fedAndSeen }: Placed) => {
    const message = fedAndSeen ? m.fedAndSeenAgo : marker.kind === 'fed' ? m.fedAgo : m.seenAgo;
    return [intl.formatMessage(message, { when: when(event) }), placeOf(intl, event, spots)].filter(Boolean).join(' · ');
  };

  return (
    <main className="app-screen">
      <header className="app-header">
        <CrownIcon className="crown-icon" />
        <span className="app-name">
          <FormattedMessage {...common.appName} />
        </span>
      </header>
      <p className="app-tagline">
        <FormattedMessage {...m.tagline} />
      </p>

      <section className="status-card" aria-labelledby="king-mood">
        <div className="status-photo">
          <img src="/king/king-sitting.jpg" alt={intl.formatMessage(m.photoAlt)} className="king-avatar" />
          <CrownIcon className="avatar-crown" />
        </div>
        <div>
          <h1 id="king-mood" className="mood-title">
            <FormattedMessage {...(hungry ? m.hungry : m.content)} />
          </h1>
          <p className="mood-subtitle">
            <FormattedMessage {...(hungry ? m.hungryDetail : m.contentDetail)} />
          </p>
          <ul className="status-chips" aria-label={intl.formatMessage(m.statusChips)}>
            {fedAndSeen ? (
              <li className={fedChipClass}>
                <FormattedMessage {...m.fedAndSeenAgo} values={{ when: when(status.lastFed!) }} />
              </li>
            ) : (
              <>
                <li className={fedChipClass}>
                  {status.lastFed ? (
                    <FormattedMessage {...m.fedAgo} values={{ when: when(status.lastFed) }} />
                  ) : (
                    <FormattedMessage {...m.notFed} />
                  )}
                </li>
                <li className="status-chip badge-neutral">
                  {status.lastSeen ? (
                    <FormattedMessage {...m.seenAgo} values={{ when: when(status.lastSeen) }} />
                  ) : (
                    <FormattedMessage {...m.notSeen} />
                  )}
                </li>
              </>
            )}
          </ul>
        </div>
      </section>

      <div className="big-actions">
        <button type="button" className="big-action btn-primary" disabled={busy} onClick={onSeen}>
          <EyeIcon />
          <FormattedMessage {...m.iSaw} />
        </button>
        <button type="button" className="big-action btn-secondary" disabled={busy} onClick={onFed}>
          <BowlIcon />
          <FormattedMessage {...m.iFed} />
        </button>
      </div>

      {mapCenter && markers.length > 0 && (
        <div className="home-map-section">
          <h2 className="section-title">
            <FormattedMessage {...m.mapTitle} />
          </h2>
          <MapView center={markers[0].point} label={intl.formatMessage(m.mapTitle)} markers={markers} fit className="home-map" />
          <ul className="map-key" aria-label={intl.formatMessage(m.mapKey)}>
            {placed.map((p) => (
              <li key={p.marker.kind} className="map-key-item">
                <span aria-hidden className={`legend-dot legend-dot-${p.marker.kind}`} />
                {keyOf(p)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="lately-heading">
        <h2 id="lately-heading" className="section-title">
          <FormattedMessage {...m.lately} />
        </h2>
        {status.recent.length === 0 ? (
          <p className="activity-detail">
            <FormattedMessage {...m.nothingYet} />
          </p>
        ) : (
          <ul className="activity-list" aria-labelledby="lately-heading">
            {status.recent.map((e) => (
              <ActivityItem key={e.id} event={e} spots={spots} time={when(e)} />
            ))}
          </ul>
        )}
        <Link to="history" className="history-link">
          <FormattedMessage {...m.seeHistory} />
        </Link>
      </section>
    </main>
  );
}
