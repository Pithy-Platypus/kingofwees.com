import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { Footer } from './Footer';
import { adminApi as liveAdminApi, loadAdminKey, saveAdminKey, type AdminApi, type AdminSession } from './king/admin';
import { kingApi, type Food, type KingEventView, type KingStatus, type SpotView } from './king/api';
import { FeedScreen, type FeedDraft } from './king/FeedScreen';
import { HomeScreen } from './king/HomeScreen';
import { LoggedScreen } from './king/LoggedScreen';
import { NicknameScreen } from './king/NicknameScreen';
import type { GeoPoint, Geolocator } from './king/location';
import { loadLastSpotId, loadNickname, saveLastSpotId, saveNickname, type KeyValueStorage } from './king/reporter';
import { SeenScreen } from './king/SeenScreen';
import { SpotScreen } from './king/SpotScreen';
import { AboutPage } from './pages/AboutPage';
import { AdminPage } from './pages/AdminPage';
import { HistoryPage } from './pages/HistoryPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { useRoute, type Route } from './routing/routes';

const m = defineMessages({
  loading: { id: 'app.loading', defaultMessage: 'Finding King…', description: 'Shown while the status loads' },
  unreachable: {
    id: 'app.unreachable',
    defaultMessage: 'Couldn’t reach King’s tracker. Check your connection and try again.',
    description: 'Shown when the status cannot be loaded',
  },
  tryAgain: { id: 'app.tryAgain', defaultMessage: 'Try again', description: 'Retry loading the status' },
});

// Browser tab titles (WCAG 2.4.2): each page says what it is.
const titles = defineMessages({
  home: { id: 'title.home', defaultMessage: 'King of Wees', description: 'Browser tab title of the home page' },
  history: { id: 'title.history', defaultMessage: 'History · King of Wees', description: 'Browser tab title of the history page' },
  about: { id: 'title.about', defaultMessage: 'About · King of Wees', description: 'Browser tab title of the About page' },
  privacy: { id: 'title.privacy', defaultMessage: 'Privacy · King of Wees', description: 'Browser tab title of the Privacy page' },
  admin: { id: 'title.admin', defaultMessage: 'Admin · King of Wees', description: 'Browser tab title of the admin page (caretakers only)' },
});

const titleOf = (route: Route) => titles[route];

const REFRESH_TIMES_EVERY_MS = 30_000;
const noFeedDraft: FeedDraft = { foods: [], leftOut: false };

type Logged = { name: 'logged'; event: KingEventView };
// The name question comes first on a device that was never asked, or from "change"; `then` is where it leads.
type Screen =
  | { name: 'home' }
  | { name: 'feed' }
  | { name: 'spots' }
  | { name: 'seen' }
  | Logged
  | { name: 'nickname'; then: 'feed' | 'seen' | Logged };
type Props = {
  api?: typeof kingApi;
  adminApi?: AdminApi;
  reporterKey: string;
  storage?: KeyValueStorage;
  geolocation?: Geolocator;
  now?: () => Date;
};

function App({ api = kingApi, adminApi = liveAdminApi, reporterKey, storage, geolocation, now = () => new Date() }: Props) {
  const [status, setStatus] = useState<KingStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [undoFailed, setUndoFailed] = useState(false);
  const [renameFailed, setRenameFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState(() => loadNickname(storage));
  const [mapCenter, setMapCenter] = useState<GeoPoint | null>(null);
  const [spots, setSpots] = useState<SpotView[]>([]);
  const [spotId, setSpotId] = useState(() => loadLastSpotId(storage));
  const [feedDraft, setFeedDraft] = useState<FeedDraft>(noFeedDraft);
  const [adminKey, setAdminKey] = useState(() => loadAdminKey(storage));
  const [, setTick] = useState(0);
  const route = useRoute();
  const intl = useIntl();

  useEffect(() => {
    document.title = intl.formatMessage(titleOf(route));
  }, [route, intl]);

  const load = useCallback(async () => {
    try {
      setStatus(await api.getStatus());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Maps and spots are extras: if they fail to load, logging still works without them.
  useEffect(() => {
    api.getMap().then(setMapCenter, () => setMapCenter(null));
    api.listSpots().then(setSpots, () => setSpots([]));
  }, [api]);

  // Re-render so "5 minutes ago" keeps moving while the page is open.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_TIMES_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // Stable, so the admin page's loading effect doesn't rerun on every render (the clock ticks every 30 s).
  const changeAdminKey = useCallback(
    (key: string | null) => {
      saveAdminKey(storage, key);
      setAdminKey(key);
    },
    [storage],
  );
  const admin = useMemo<AdminSession | undefined>(
    () => (adminKey ? { key: adminKey, api: adminApi, onRejected: () => changeAdminKey(null) } : undefined),
    [adminKey, adminApi, changeAdminKey],
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  // Switch to Home only after the fresh status arrives, so it never shows what was there before the log.
  const showFreshHome = async () => {
    await load();
    setUndoFailed(false);
    setRenameFailed(false);
    setScreen({ name: 'home' });
  };

  const goHome = () => run(showFreshHome);

  // Skipped (or never given) names are left out, so the entry reads "a neighbor".
  const reporter = (name: string | null) => ({ reporterKey, ...(name ? { reporterName: name } : {}) });

  // A remembered spot that no longer exists (or hasn't loaded) is simply not offered.
  const spot = spots.find((s) => s.id === spotId) ?? null;

  const logFeeding = (foods: Food[], sawKing: boolean) =>
    run(async () => {
      const event = await api.logFeeding({ ...reporter(nickname), foods, sawKing, ...(spot ? { spotId: spot.id } : {}) });
      saveLastSpotId(storage, spot?.id ?? null);
      setScreen({ name: 'logged', event });
    });

  const logSighting = (location?: GeoPoint) =>
    run(async () =>
      setScreen({ name: 'logged', event: await api.logSighting({ ...reporter(nickname), ...(location ? { location } : {}) }) }),
    );

  const addSpot = (name: string, location: GeoPoint) =>
    run(async () => {
      const added = await api.addSpot({ reporterKey, name, location });
      setSpots((current) => [...current, added]);
      setSpotId(added.id);
      setScreen({ name: 'feed' });
    });

  const startFeeding = () => {
    setFeedDraft(noFeedDraft);
    setScreen(nickname === null ? { name: 'nickname', then: 'feed' } : { name: 'feed' });
  };

  const startSighting = () => setScreen(nickname === null ? { name: 'nickname', then: 'seen' } : { name: 'seen' });

  // From the confirmation, the entry just logged takes the new name too; later entries use it either way.
  const nameChosen = (name: string, then: 'feed' | 'seen' | Logged) => {
    saveNickname(storage, name);
    setNickname(name);
    if (then === 'feed') setScreen({ name: 'feed' });
    else if (then === 'seen') setScreen({ name: 'seen' });
    else
      void run(async () => {
        try {
          await api.renameEvent(then.event.id, reporterKey, name || null);
          setRenameFailed(false);
        } catch {
          setRenameFailed(true);
        }
        setScreen(then);
      });
  };

  const undo = (event: KingEventView) =>
    run(async () => {
      try {
        await api.undo(event.id, reporterKey);
      } catch {
        setUndoFailed(true);
        return;
      }
      await showFreshHome();
    });

  let content: ReactElement;
  let withFooter = true;
  if (route === 'history') {
    content = <HistoryPage api={api} spots={spots} mapCenter={mapCenter} now={now()} admin={admin} />;
  } else if (route === 'admin') {
    content = <AdminPage api={adminApi} adminKey={adminKey} onKey={changeAdminKey} spots={spots} now={now()} />;
  } else if (route === 'about') {
    content = <AboutPage />;
  } else if (route === 'privacy') {
    content = <PrivacyPage />;
  } else if (screen.name === 'nickname') {
    const then = screen.then;
    content = <NicknameScreen initialName={nickname ?? ''} onDone={(name) => nameChosen(name, then)} />;
    withFooter = false;
  } else if (screen.name === 'feed') {
    content = (
      <FeedScreen
        busy={busy}
        spots={spots}
        spotId={spot?.id ?? null}
        draft={feedDraft}
        onDraft={setFeedDraft}
        onPickSpot={setSpotId}
        onAddSpot={() => setScreen({ name: 'spots' })}
        onLog={logFeeding}
        onBack={goHome}
      />
    );
    withFooter = false;
  } else if (screen.name === 'spots') {
    content = (
      <SpotScreen
        mapCenter={mapCenter}
        geolocation={geolocation}
        busy={busy}
        onAdd={addSpot}
        onBack={() => setScreen({ name: 'feed' })}
      />
    );
    withFooter = false;
  } else if (screen.name === 'seen') {
    content = (
      <SeenScreen spots={spots} mapCenter={mapCenter} geolocation={geolocation} busy={busy} onLog={logSighting} onBack={goHome} />
    );
    withFooter = false;
  } else if (screen.name === 'logged') {
    const event = screen.event;
    content = (
      <LoggedScreen
        event={event}
        nickname={nickname ?? ''}
        undoFailed={undoFailed}
        renameFailed={renameFailed}
        busy={busy}
        onUndo={() => undo(event)}
        onDone={goHome}
        onChangeName={() => setScreen({ name: 'nickname', then: screen })}
      />
    );
    withFooter = false;
  } else if (loadFailed) {
    content = (
      <main className="app-screen">
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.unreachable} />
        </div>
        <button type="button" className="done-button" onClick={() => void load()}>
          <FormattedMessage {...m.tryAgain} />
        </button>
      </main>
    );
  } else if (!status) {
    content = (
      <main className="app-screen">
        <p role="status">
          <FormattedMessage {...m.loading} />
        </p>
      </main>
    );
  } else {
    content = (
      <HomeScreen
        status={status}
        spots={spots}
        mapCenter={mapCenter}
        now={now()}
        busy={busy}
        onFed={startFeeding}
        onSeen={startSighting}
      />
    );
  }

  return (
    <div className="app-frame">
      {content}
      {withFooter && <Footer />}
    </div>
  );
}

export default App;
