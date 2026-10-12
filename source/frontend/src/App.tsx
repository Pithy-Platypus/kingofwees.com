import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { Footer } from './Footer';
import { adminApi as liveAdminApi, loadAdminSignIn, saveAdminSignIn, type AdminApi, type AdminSession, type AdminSignIn } from './king/admin';
import { ApiError, isPostingRefused, kingApi, type Food, type KingEventView, type KingStatus, type SpotView } from './king/api';
import { FeedScreen, type FeedDraft } from './king/FeedScreen';
import { HomeScreen } from './king/HomeScreen';
import { LoggedScreen } from './king/LoggedScreen';
import { NicknameScreen } from './king/NicknameScreen';
import { resizePhoto, type PhotoFiles, type PhotoResizer } from './king/photo';
import { DraftPhoto, LoggedPhoto, type PhotoState } from './king/PhotoSlot';
import type { GeoPoint, Geolocator } from './king/location';
import { loadLastSpotId, loadNickname, saveLastSpotId, saveNickname, type KeyValueStorage } from './king/reporter';
import { SeenScreen } from './king/SeenScreen';
import { SpotScreen } from './king/SpotScreen';
import { AboutPage } from './pages/AboutPage';
import { HistoryPage } from './pages/HistoryPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { useRoute, type Route } from './routing/routes';

// Only caretakers open /admin, so visitors never download it (it pushed the main bundle past Vite's 500 kB warning).
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
// Loaded when opened, so Home stays well under that warning.
const PhotosPage = lazy(() => import('./pages/PhotosPage').then((module) => ({ default: module.PhotosPage })));

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
  photos: { id: 'title.photos', defaultMessage: 'Photos · King of Wees', description: 'Browser tab title of the page with every photo of King' },
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
  resize?: PhotoResizer;
};

function App({
  api = kingApi,
  adminApi = liveAdminApi,
  reporterKey,
  storage,
  geolocation,
  now = () => new Date(),
  resize = resizePhoto,
}: Props) {
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
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [postingAllowed, setPostingAllowed] = useState(true);
  const [adminSignIn, setAdminSignIn] = useState(() => loadAdminSignIn(storage));
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
    // If the check fails, the buttons stay: the server still refuses a post from outside the US.
    api.getPosting().then(setPostingAllowed, () => setPostingAllowed(true));
  }, [api]);

  // Re-render so "5 minutes ago" keeps moving while the page is open.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_TIMES_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // Stable, so the admin page's loading effect doesn't rerun on every render (the clock ticks every 30 s).
  const changeAdminSignIn = useCallback(
    (signIn: AdminSignIn | null) => {
      saveAdminSignIn(storage, signIn);
      setAdminSignIn(signIn);
    },
    [storage],
  );
  const admin = useMemo<AdminSession | undefined>(
    () => (adminSignIn ? { signIn: adminSignIn, api: adminApi, onRejected: () => changeAdminSignIn(null) } : undefined),
    [adminSignIn, adminApi, changeAdminSignIn],
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (!isPostingRefused(error)) throw error;
      setPostingAllowed(false);
      setScreen({ name: 'home' });
    } finally {
      setBusy(false);
    }
  };

  // Switch to Home only after the fresh status arrives, so it never shows what was there before the log.
  const showFreshHome = async () => {
    await load();
    setUndoFailed(false);
    setRenameFailed(false);
    setPhoto(null);
    setScreen({ name: 'home' });
  };

  const goHome = () => run(showFreshHome);

  // Skipped (or never given) names are left out, so the entry reads "a neighbor".
  const reporter = (name: string | null) => ({ reporterKey, ...(name ? { reporterName: name } : {}) });

  // A remembered spot that no longer exists (or hasn't loaded) is simply not offered.
  const spot = spots.find((s) => s.id === spotId) ?? null;

  // 409 is the undo window closing (photo.exists can't happen: one photo per entry from this screen, with busy guards).
  const sendPhoto = async (event: KingEventView, files: PhotoFiles) => {
    setPhoto({ status: 'sending', files });
    try {
      await api.addPhoto(event.id, reporterKey, files);
      setPhoto({ status: 'added', files });
    } catch (error) {
      setPhoto(error instanceof ApiError && error.status === 409 ? { status: 'tooLate' } : { status: 'failed', files });
    }
  };

  const readPhoto = async (file: File) => {
    setPhoto({ status: 'reading' });
    try {
      return await resize(file);
    } catch {
      setPhoto({ status: 'unreadable' });
      return null;
    }
  };

  const pickDraftPhoto = async (file: File) => {
    const files = await readPhoto(file);
    if (files) setPhoto({ status: 'picked', files });
  };

  const pickLoggedPhoto = async (event: KingEventView, file: File) => {
    const files = await readPhoto(file);
    if (files) await run(() => sendPhoto(event, files));
  };

  // The entry is posted first and shown at once; its photo follows, and a failed photo never takes the entry with it.
  const showLogged = async (event: KingEventView) => {
    const files = event.sawKing && photo?.status === 'picked' ? photo.files : null;
    setPhoto(null);
    setScreen({ name: 'logged', event });
    if (files) await sendPhoto(event, files);
  };

  const logFeeding = (foods: Food[], sawKing: boolean) =>
    run(async () => {
      const event = await api.logFeeding({ ...reporter(nickname), foods, sawKing, ...(spot ? { spotId: spot.id } : {}) });
      saveLastSpotId(storage, spot?.id ?? null);
      await showLogged(event);
    });

  const logSighting = (location?: GeoPoint) =>
    run(async () => showLogged(await api.logSighting({ ...reporter(nickname), ...(location ? { location } : {}) })));

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

  // Nothing logs while a picked photo is still being shrunk, so it can't be left behind.
  const photoBusy = busy || photo?.status === 'reading';
  const draftPhoto = <DraftPhoto photo={photo} onPick={(file) => void pickDraftPhoto(file)} onRemove={() => setPhoto(null)} />;

  let content: ReactElement;
  let withFooter = true;
  if (route === 'history') {
    content = <HistoryPage api={api} spots={spots} mapCenter={mapCenter} now={now()} admin={admin} />;
  } else if (route === 'photos') {
    content = (
      <Suspense fallback={null}>
        <PhotosPage
          api={api}
          spots={spots}
          reporterKey={reporterKey}
          nickname={nickname}
          postingAllowed={postingAllowed}
          onPostingRefused={() => setPostingAllowed(false)}
          onPhotosChanged={() => void load()}
          resize={resize}
          admin={admin}
        />
      </Suspense>
    );
  } else if (route === 'admin') {
    content = (
      <Suspense fallback={null}>
        <AdminPage
          api={adminApi}
          signIn={adminSignIn}
          onSignIn={changeAdminSignIn}
          spots={spots}
          onSpotRenamed={(id, name) => setSpots((current) => current.map((s) => (s.id === id ? { ...s, name } : s)))}
          onSpotsMerged={(keptId, name, mergedIds) =>
            setSpots((current) =>
              current.filter((s) => !mergedIds.includes(s.id)).map((s) => (s.id === keptId ? { ...s, name } : s)),
            )
          }
          now={now()}
        />
      </Suspense>
    );
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
        busy={photoBusy}
        spots={spots}
        spotId={spot?.id ?? null}
        draft={feedDraft}
        photo={draftPhoto}
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
      <SeenScreen
        spots={spots}
        mapCenter={mapCenter}
        geolocation={geolocation}
        busy={photoBusy}
        photo={draftPhoto}
        onLog={logSighting}
        onBack={goHome}
      />
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
        busy={photoBusy}
        photo={
          event.sawKing && (
            <LoggedPhoto
              photo={photo}
              kind={event.kind}
              onPick={(file) => void pickLoggedPhoto(event, file)}
              onRetry={() => {
                if (photo?.status === 'failed') void run(() => sendPhoto(event, photo.files));
              }}
            />
          )
        }
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
        postingAllowed={postingAllowed}
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
