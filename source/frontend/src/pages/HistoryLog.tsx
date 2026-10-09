import { useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageTag, type NoMessageValues } from 'react-intl';
import type { AdminSession } from '../king/admin';
import type { KingEventView, kingApi, SpotView } from '../king/api';
import { ActivityItem } from '../king/ActivityItem';
import { Link } from '../routing/Link';
import { AdminEntryActions } from './AdminEntryActions';

type Values = {
  heading: NoMessageValues;
  today: NoMessageValues;
  yesterday: NoMessageValues;
  showOlder: NoMessageValues;
  empty: NoMessageValues;
  loading: NoMessageValues;
  failed: NoMessageValues;
  olderFailed: NoMessageValues;
  tryAgain: NoMessageValues;
  hidden: { admin: MessageTag };
};

const m = defineMessages<Values>({
  heading: { id: 'log.heading', defaultMessage: 'Every entry', description: 'Heading over the full log on the history page' },
  today: { id: 'log.today', defaultMessage: 'Today', description: 'Day heading in the log' },
  yesterday: { id: 'log.yesterday', defaultMessage: 'Yesterday', description: 'Day heading in the log' },
  showOlder: { id: 'log.showOlder', defaultMessage: 'Show older', description: 'Loads the next, older page of entries' },
  empty: { id: 'log.empty', defaultMessage: 'Nothing logged yet.', description: 'The log has no entries at all' },
  loading: { id: 'log.loading', defaultMessage: 'Loading King’s history…', description: 'Shown while the log loads' },
  failed: { id: 'log.failed', defaultMessage: 'Couldn’t load King’s history.', description: 'Shown when the log cannot be loaded' },
  olderFailed: { id: 'log.olderFailed', defaultMessage: 'Couldn’t load older entries.', description: 'Shown when Show older fails' },
  tryAgain: { id: 'log.tryAgain', defaultMessage: 'Try again', description: 'Retry loading the log' },
  hidden: {
    id: 'log.hidden',
    defaultMessage: 'Hidden. You can restore it on the <admin>admin page</admin>.',
    description: 'Shown to an admin after hiding an entry or a poster; <admin> links to the admin page',
  },
});

type Day = { key: string; date: Date; events: KingEventView[] };

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Days in the reader's own time zone; events arrive newest first, so days do too.
function byDay(events: KingEventView[]): Day[] {
  const days: Day[] = [];
  for (const e of events) {
    const date = new Date(e.occurredAt);
    const key = dayKey(date);
    const last = days[days.length - 1];
    if (last?.key === key) last.events.push(e);
    else days.push({ key, date, events: [e] });
  }
  return days;
}

type Props = { api: Pick<typeof kingApi, 'getHistory'>; spots: SpotView[]; now: Date; admin?: AdminSession };

export function HistoryLog({ api, spots, now, admin }: Props) {
  const intl = useIntl();
  const [events, setEvents] = useState<KingEventView[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const firstNew = useRef<HTMLLIElement>(null);
  const [hidCount, setHidCount] = useState(0);
  const hiddenNotice = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setFailed(false);
    api.getHistory().then(
      (page) => {
        setEvents(page.events);
        setNext(page.next);
      },
      () => setFailed(true),
    );
  }, [api, attempt]);

  // Keyboard and screen-reader users land on the first entry they asked for.
  useEffect(() => firstNew.current?.focus(), [focusId]);

  // The hidden entry's buttons are gone, so focus moves to what happened.
  useEffect(() => {
    if (hidCount > 0) hiddenNotice.current?.focus();
  }, [hidCount]);

  // Reload from the newest: hiding a poster can take entries from any page.
  const afterHiding = () => {
    setHidCount((n) => n + 1);
    setAttempt((a) => a + 1);
  };

  const showOlder = async (before: string) => {
    setLoadingOlder(true);
    try {
      const page = await api.getHistory(before);
      setEvents((shown) => [...(shown ?? []), ...page.events]);
      setNext(page.next);
      setOlderFailed(false);
      setFocusId(page.events[0]?.id ?? null);
    } catch {
      setOlderFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dayName = (date: Date) => {
    if (dayKey(date) === dayKey(now)) return intl.formatMessage(m.today);
    if (dayKey(date) === dayKey(yesterday)) return intl.formatMessage(m.yesterday);
    const year = date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const };
    return intl.formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', ...year });
  };
  const timeOf = (e: KingEventView) => intl.formatTime(new Date(e.occurredAt), { hour: 'numeric', minute: '2-digit' });

  let body;
  if (failed) {
    body = (
      <>
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.failed} />
        </div>
        <button type="button" className="done-button" onClick={() => setAttempt((a) => a + 1)}>
          <FormattedMessage {...m.tryAgain} />
        </button>
      </>
    );
  } else if (!events) {
    body = (
      <p role="status">
        <FormattedMessage {...m.loading} />
      </p>
    );
  } else if (events.length === 0) {
    body = (
      <p className="activity-detail">
        <FormattedMessage {...m.empty} />
      </p>
    );
  } else {
    body = (
      <>
        {byDay(events).map((day) => (
          <div key={day.key} className="log-day">
            <h3 id={`day-${day.key}`} className="log-day-title">
              {dayName(day.date)}
            </h3>
            <ul className="activity-list" aria-labelledby={`day-${day.key}`}>
              {day.events.map((e) => (
                <ActivityItem
                  key={e.id}
                  event={e}
                  spots={spots}
                  time={timeOf(e)}
                  ref={e.id === focusId ? firstNew : undefined}
                  actions={admin && <AdminEntryActions event={e} admin={admin} onHidden={afterHiding} />}
                />
              ))}
            </ul>
          </div>
        ))}
        {olderFailed && (
          <div role="alert" className="alert alert-error">
            <FormattedMessage {...m.olderFailed} />
          </div>
        )}
        {next !== null && (
          <button type="button" className="done-button" disabled={loadingOlder} onClick={() => void showOlder(next)}>
            <FormattedMessage {...m.showOlder} />
          </button>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="log-heading" className="log-section">
      <h2 id="log-heading" className="section-title">
        <FormattedMessage {...m.heading} />
      </h2>
      {hidCount > 0 && (
        <p ref={hiddenNotice} tabIndex={-1} role="status" className="screen-hint">
          <FormattedMessage
            {...m.hidden}
            values={{
              admin: (chunks) => (
                <Link to="admin" className="text-link">
                  {chunks}
                </Link>
              ),
            }}
          />
        </p>
      )}
      {body}
    </section>
  );
}
