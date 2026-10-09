import { useEffect, useId, useState, type FormEvent } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor, type MessageTag, type NoMessageValues } from 'react-intl';
import { isKeyRejected, looksLikeKeyHash, type AdminApi, type HiddenDevice } from '../king/admin';
import { ActivityItem } from '../king/ActivityItem';
import { ApiError, type KingEventView, type SpotView } from '../king/api';
import { common } from '../king/messages';
import { Link } from '../routing/Link';
import { PageShell } from './PageShell';

type Values = {
  title: NoMessageValues;
  keyLabel: NoMessageValues;
  keyHint: NoMessageValues;
  check: NoMessageValues;
  wrongKey: NoMessageValues;
  hashPasted: NoMessageValues;
  tooMany: NoMessageValues;
  unreachable: NoMessageValues;
  howToHide: { history: MessageTag };
  entriesHeading: NoMessageValues;
  noEntries: NoMessageValues;
  showAgain: NoMessageValues;
  postersHeading: NoMessageValues;
  noPosters: NoMessageValues;
  poster: { entries: number; spots: number; when: string };
  restore: NoMessageValues;
  loading: NoMessageValues;
  loadFailed: NoMessageValues;
  actionFailed: NoMessageValues;
  signOut: NoMessageValues;
};

const m = defineMessages<Values>({
  title: { id: 'admin.title', defaultMessage: 'Admin', description: 'Heading of the admin page, for the site’s caretakers' },
  keyLabel: { id: 'admin.keyLabel', defaultMessage: 'Admin key', description: 'Label of the admin key field' },
  keyHint: { id: 'admin.keyHint', defaultMessage: 'Only the site’s caretakers have one.', description: 'Under the admin key field' },
  check: { id: 'admin.check', defaultMessage: 'Check key', description: 'Checks the admin key with the site and keeps it on this device' },
  wrongKey: { id: 'admin.wrongKey', defaultMessage: 'That key didn’t work.', description: 'The site refused the admin key' },
  hashPasted: {
    id: 'admin.hashPasted',
    defaultMessage: 'That looks like the key’s hash. Enter the key itself — the shorter line from the key tool.',
    description: 'The 64-character server setting was entered instead of the admin key',
  },
  tooMany: {
    id: 'admin.tooMany',
    defaultMessage: 'Too many tries. Wait a minute, then try again.',
    description: 'The site is limiting admin requests from this address',
  },
  unreachable: { id: 'admin.unreachable', defaultMessage: 'Couldn’t reach the site. Try again.', description: 'Checking the key failed' },
  howToHide: {
    id: 'admin.howToHide',
    defaultMessage: 'To hide something, use the buttons under each entry on <history>King’s history</history>.',
    description: 'Tells admins where hiding happens; <history> links to the history page',
  },
  entriesHeading: { id: 'admin.entriesHeading', defaultMessage: 'Hidden entries', description: 'Heading over entries hidden one by one' },
  noEntries: { id: 'admin.noEntries', defaultMessage: 'No hidden entries.', description: 'No entry is hidden on its own' },
  showAgain: { id: 'admin.showAgain', defaultMessage: 'Show again', description: 'Un-hides one entry' },
  postersHeading: { id: 'admin.postersHeading', defaultMessage: 'Hidden posters', description: 'Heading over hidden posters (devices)' },
  noPosters: { id: 'admin.noPosters', defaultMessage: 'No hidden posters.', description: 'No poster is hidden' },
  poster: {
    id: 'admin.poster',
    defaultMessage:
      '{entries, plural, one {# entry} other {# entries}} · {spots, plural, one {# spot} other {# spots}} · hidden {when}',
    description: 'What a hidden poster posted; {when} is the date they were hidden',
  },
  restore: { id: 'admin.restore', defaultMessage: 'Restore', description: 'Shows everything from a hidden poster again' },
  loading: { id: 'admin.loading', defaultMessage: 'Loading what’s hidden…', description: 'Shown while the hidden lists load' },
  loadFailed: { id: 'admin.loadFailed', defaultMessage: 'Couldn’t load what’s hidden.', description: 'The hidden lists failed to load' },
  actionFailed: { id: 'admin.actionFailed', defaultMessage: 'That didn’t work. Try again.', description: 'Show again or Restore failed' },
  signOut: { id: 'admin.signOut', defaultMessage: 'Sign out on this device', description: 'Forgets the admin key on this device' },
});

type Props = { api: AdminApi; adminKey: string | null; onKey: (key: string | null) => void; spots: SpotView[]; now: Date };

/** The caretakers' page: not linked anywhere. Without a key it asks for one; with one it lists what's hidden. */
export function AdminPage({ api, adminKey, onKey, spots, now }: Props) {
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      {adminKey ? (
        <HiddenLists api={api} adminKey={adminKey} onKey={onKey} spots={spots} now={now} />
      ) : (
        <KeyForm api={api} onKey={onKey} />
      )}
    </PageShell>
  );
}

function KeyForm({ api, onKey }: Pick<Props, 'api' | 'onKey'>) {
  const [key, setKey] = useState('');
  const [problem, setProblem] = useState<MessageDescriptor | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const hintId = useId();

  const check = async (e: FormEvent) => {
    e.preventDefault();
    const typed = key.trim();
    // The hash never works as a key; say why without spending one of the limited tries.
    if (looksLikeKeyHash(typed)) {
      setProblem(m.hashPasted);
      return;
    }
    setBusy(true);
    try {
      await api.check(typed);
      onKey(typed);
    } catch (error) {
      if (isKeyRejected(error)) setProblem(m.wrongKey);
      else if (error instanceof ApiError && error.status === 429) setProblem(m.tooMany);
      else setProblem(m.unreachable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="field-form" onSubmit={(e) => void check(e)}>
      <label htmlFor={inputId} className="field-label">
        <FormattedMessage {...m.keyLabel} />
      </label>
      <p id={hintId} className="screen-hint">
        <FormattedMessage {...m.keyHint} />
      </p>
      <input
        id={inputId}
        type="password"
        className="field-input"
        required
        autoComplete="current-password"
        aria-describedby={hintId}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      {problem && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...problem} />
        </div>
      )}
      <button type="submit" className="done-button" disabled={busy}>
        <FormattedMessage {...m.check} />
      </button>
    </form>
  );
}

function HiddenLists({ api, adminKey, onKey, spots, now }: Props & { adminKey: string }) {
  const intl = useIntl();
  const [entries, setEntries] = useState<KingEventView[] | null>(null);
  const [devices, setDevices] = useState<HiddenDevice[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

  // A key the server no longer accepts (rotated) is forgotten, which brings back the key form.
  useEffect(() => {
    Promise.all([api.hiddenEntries(adminKey), api.hiddenDevices(adminKey)]).then(
      ([hiddenEntries, hiddenDevices]) => {
        setEntries(hiddenEntries);
        setDevices(hiddenDevices);
      },
      (error: unknown) => (isKeyRejected(error) ? onKey(null) : setLoadFailed(true)),
    );
  }, [api, adminKey, onKey]);

  const act = async (action: () => Promise<void>, done: () => void) => {
    try {
      await action();
      setActionFailed(false);
      done();
    } catch (error) {
      if (isKeyRejected(error)) onKey(null);
      else setActionFailed(true);
    }
  };

  const showAgain = (id: string) =>
    act(() => api.unhideEntry(adminKey, id), () => setEntries((shown) => shown?.filter((e) => e.id !== id) ?? null));
  const restore = (id: string) =>
    act(() => api.restoreDevice(adminKey, id), () => setDevices((shown) => shown?.filter((d) => d.id !== id) ?? null));
  const timeOf = (e: KingEventView) => intl.formatDate(new Date(e.occurredAt), { month: 'short', day: 'numeric' });
  const sameYear = (iso: string) => new Date(iso).getFullYear() === now.getFullYear();
  const dateOf = (iso: string) =>
    intl.formatDate(new Date(iso), { month: 'short', day: 'numeric', ...(sameYear(iso) ? {} : { year: 'numeric' as const }) });

  let lists;
  if (loadFailed) {
    lists = (
      <div role="alert" className="alert alert-error">
        <FormattedMessage {...m.loadFailed} />
      </div>
    );
  } else if (!entries || !devices) {
    lists = (
      <p role="status">
        <FormattedMessage {...m.loading} />
      </p>
    );
  } else {
    lists = (
      <>
        {actionFailed && (
          <div role="alert" className="alert alert-error">
            <FormattedMessage {...m.actionFailed} />
          </div>
        )}
        <section aria-labelledby="hidden-entries" className="log-section">
          <h2 id="hidden-entries" className="section-title">
            <FormattedMessage {...m.entriesHeading} />
          </h2>
          {entries.length === 0 ? (
            <p className="activity-detail">
              <FormattedMessage {...m.noEntries} />
            </p>
          ) : (
            <ul className="activity-list" aria-labelledby="hidden-entries">
              {entries.map((e) => (
                <ActivityItem
                  key={e.id}
                  event={e}
                  spots={spots}
                  time={timeOf(e)}
                  actions={
                    <div className="admin-buttons">
                      <button type="button" className="admin-button" onClick={() => void showAgain(e.id)}>
                        <FormattedMessage {...m.showAgain} />
                      </button>
                    </div>
                  }
                />
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="hidden-posters" className="log-section">
          <h2 id="hidden-posters" className="section-title">
            <FormattedMessage {...m.postersHeading} />
          </h2>
          {devices.length === 0 ? (
            <p className="activity-detail">
              <FormattedMessage {...m.noPosters} />
            </p>
          ) : (
            <ul className="activity-list" aria-labelledby="hidden-posters">
              {devices.map((d) => (
                <li key={d.id} className="activity-item">
                  <span className="activity-text">
                    <strong>{d.reporterName ?? intl.formatMessage(common.aNeighbor)}</strong>
                    <span className="activity-detail">
                      <FormattedMessage {...m.poster} values={{ entries: d.entries, spots: d.spots, when: dateOf(d.hiddenAt) }} />
                    </span>
                  </span>
                  <button type="button" className="admin-button" onClick={() => void restore(d.id)}>
                    <FormattedMessage {...m.restore} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <p className="screen-hint">
        <FormattedMessage
          {...m.howToHide}
          values={{
            history: (chunks) => (
              <Link to="history" className="text-link">
                {chunks}
              </Link>
            ),
          }}
        />
      </p>
      {lists}
      <button type="button" className="admin-button" onClick={() => onKey(null)}>
        <FormattedMessage {...m.signOut} />
      </button>
    </>
  );
}
