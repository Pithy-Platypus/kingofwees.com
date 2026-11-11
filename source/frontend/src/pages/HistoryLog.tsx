import { useCallback, useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import type { AdminSession } from '../king/admin';
import type { KingEventView, kingApi, SpotView } from '../king/api';
import { ActivityItem } from '../king/ActivityItem';
import { dayKey } from '../king/habits';
import type { OwnUndo } from '../king/ownPosts';
import { ownMessages } from '../king/ownMessages';
import { UndoOwnPost } from '../king/UndoOwnPost';
import { useLoad } from '../king/useLoad';
import { Link } from '../routing/Link';
import { AdminEntryActions } from './AdminEntryActions';
import { adminMessages } from './adminMessages';
import { LoadState } from './LoadState';

type Values = {
  heading: NoMessageValues;
  today: NoMessageValues;
  yesterday: NoMessageValues;
  showOlder: NoMessageValues;
  empty: NoMessageValues;
  loading: NoMessageValues;
  failed: NoMessageValues;
  olderFailed: NoMessageValues;
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
});

type Day = { key: string; date: Date; events: KingEventView[] };

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

type Props = {
  api: Pick<typeof kingApi, 'getHistory'>;
  spots: SpotView[];
  now: Date;
  admin?: AdminSession;
  /** This device's own recent entries get Undo. */
  own?: OwnUndo;
  /** An entry was undone here: Home's status should load again. */
  onUndone?: () => void;
};

export function HistoryLog({ api, spots, now, admin, own, onUndone }: Props) {
  const intl = useIntl();
  // Only the latest page may land: after Undo or hiding, a slow earlier page must not overwrite the fresh one (useLoad).
  const getHistory = useCallback(() => api.getHistory(), [api]);
  const { data: page, setData: setPage, failed, retry } = useLoad(getHistory);
  const [olderFailed, setOlderFailed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const firstNew = useRef<HTMLLIElement>(null);
  const [hidCount, setHidCount] = useState(0);
  const hiddenNotice = useRef<HTMLParagraphElement>(null);
  const [undoneCount, setUndoneCount] = useState(0);
  const undoneNotice = useRef<HTMLParagraphElement>(null);

  // Keyboard and screen-reader users land on the first entry they asked for.
  useEffect(() => firstNew.current?.focus(), [focusId]);

  // The hidden entry's buttons are gone, so focus moves to what happened.
  useEffect(() => {
    if (hidCount > 0) hiddenNotice.current?.focus();
  }, [hidCount]);
  useEffect(() => {
    if (undoneCount > 0) undoneNotice.current?.focus();
  }, [undoneCount]);

  const afterUndoing = () => {
    setUndoneCount((n) => n + 1);
    void retry();
    onUndone?.();
  };

  // Reload from the newest: hiding a poster can take entries from any page.
  const afterHiding = () => {
    setHidCount((n) => n + 1);
    void retry();
  };

  const showOlder = async (before: string) => {
    setLoadingOlder(true);
    try {
      const older = await api.getHistory(before);
      setPage((shown) => shown && { events: [...shown.events, ...older.events], next: older.next });
      setOlderFailed(false);
      setFocusId(older.events[0]?.id ?? null);
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

  const body = (
    <LoadState data={page} failed={failed} onRetry={retry} messages={m} isEmpty={(shown) => shown.events.length === 0}>
      {({ events, next }) => (
        <>
          {byDay(events).map((day) => (
            <div key={day.key} className="log-day">
              <h3 id={`day-${day.key}`} className="section-subtitle">
                {dayName(day.date)}
              </h3>
              <ul className="activity-list" aria-labelledby={`day-${day.key}`}>
                {day.events.map((e) => {
                  const undo = own?.canUndo(e.id) && (
                    <UndoOwnPost what={e.kind} onConfirm={() => own.undoEntry(e.id)} onDone={afterUndoing} />
                  );
                  const hide = admin && <AdminEntryActions event={e} admin={admin} onHidden={afterHiding} />;
                  return (
                    <ActivityItem
                      key={e.id}
                      event={e}
                      spots={spots}
                      time={timeOf(e)}
                      ref={e.id === focusId ? firstNew : undefined}
                      actions={
                        (undo || hide) && (
                          <>
                            {undo}
                            {hide}
                          </>
                        )
                      }
                    />
                  );
                })}
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
      )}
    </LoadState>
  );

  return (
    <section aria-labelledby="log-heading" className="log-section">
      <h2 id="log-heading" className="section-title">
        <FormattedMessage {...m.heading} />
      </h2>
      {undoneCount > 0 && (
        <p ref={undoneNotice} tabIndex={-1} role="status" className="screen-hint">
          <FormattedMessage {...ownMessages.undone} values={{ what: 'entry' }} />
        </p>
      )}
      {hidCount > 0 && (
        <p ref={hiddenNotice} tabIndex={-1} role="status" className="screen-hint">
          <FormattedMessage
            {...adminMessages.hidden}
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
