import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import type { KingEventView, KingStatus } from './api';
import { BowlIcon, CrownIcon, EyeIcon } from './icons';
import { common, foodMessage, formatWhen } from './messages';
import { kingMood } from './time';

// Placeholder types are declared so a missing or misspelled {value} fails the type-check.
type Values = {
  tagline: NoMessageValues;
  photoAlt: NoMessageValues;
  content: NoMessageValues;
  contentDetail: NoMessageValues;
  hungry: NoMessageValues;
  hungryDetail: NoMessageValues;
  fedAgo: { when: string };
  notFed: NoMessageValues;
  seenAgo: { when: string };
  notSeen: NoMessageValues;
  iSaw: NoMessageValues;
  iFed: NoMessageValues;
  lately: NoMessageValues;
  nothingYet: NoMessageValues;
  fedBy: { name: string };
  seenBy: { name: string };
  aNeighbor: NoMessageValues;
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
  fedAgo: { id: 'home.fedAgo', defaultMessage: 'Fed {when}', description: 'Chip; {when} is e.g. “2 hours ago” or “just now”' },
  notFed: { id: 'home.notFed', defaultMessage: 'Not fed yet', description: 'Chip when no feeding has been logged' },
  seenAgo: { id: 'home.seenAgo', defaultMessage: 'Seen {when}', description: 'Chip; {when} is e.g. “25 minutes ago”' },
  notSeen: { id: 'home.notSeen', defaultMessage: 'Not seen yet', description: 'Chip when no sighting has been logged' },
  iSaw: { id: 'home.iSawKing', defaultMessage: 'I saw King', description: 'Big button to log a sighting' },
  iFed: { id: 'home.iFedKing', defaultMessage: 'I fed King', description: 'Big button to log a feeding' },
  lately: { id: 'home.lately', defaultMessage: 'Lately', description: 'Heading over the recent activity list' },
  nothingYet: { id: 'home.nothingYet', defaultMessage: 'Nothing logged yet. Be the first!', description: 'Shown when the activity list is empty' },
  fedBy: { id: 'home.fedBy', defaultMessage: 'Fed by {name}', description: 'Activity item; {name} is who fed King' },
  seenBy: { id: 'home.seenBy', defaultMessage: 'Seen by {name}', description: 'Activity item; {name} is who saw King' },
  aNeighbor: { id: 'home.aNeighbor', defaultMessage: 'a neighbor', description: 'Used as {name} when the reporter gave no name' },
});

type Props = { status: KingStatus; now: Date; busy?: boolean; onFed: () => void; onSeen: () => void };

export function HomeScreen({ status, now, busy = false, onFed, onSeen }: Props) {
  const intl = useIntl();
  const hungry = kingMood(status.lastFed && new Date(status.lastFed.occurredAt), now) === 'hungry';
  const when = (e: KingEventView) => formatWhen(intl, new Date(e.occurredAt), now);

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
          <ul className="status-chips">
            <li className={`status-chip ${hungry ? 'badge-error' : 'badge-success'}`}>
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
            {status.recent.map((e) => {
              const name = e.reporterName ?? intl.formatMessage(m.aNeighbor);
              return (
                <li key={e.id} className="activity-item">
                  <span className={`activity-icon ${e.kind === 'fed' ? 'bg-secondary text-secondary-content' : 'bg-primary text-primary-content'}`}>
                    {e.kind === 'fed' ? <BowlIcon /> : <EyeIcon />}
                  </span>
                  <span className="activity-text">
                    <strong>
                      {e.kind === 'fed' ? (
                        <FormattedMessage {...m.fedBy} values={{ name }} />
                      ) : (
                        <FormattedMessage {...m.seenBy} values={{ name }} />
                      )}
                    </strong>
                    {e.foods.length > 0 && (
                      <span className="activity-detail">
                        {intl.formatList(e.foods.map((f) => intl.formatMessage(foodMessage(f))))}
                      </span>
                    )}
                  </span>
                  <span className="activity-time">{when(e)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
