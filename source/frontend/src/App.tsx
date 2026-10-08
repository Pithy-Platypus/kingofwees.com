import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { Footer } from './Footer';
import { kingApi, type Food, type KingEventView, type KingStatus } from './king/api';
import { FeedScreen } from './king/FeedScreen';
import { HomeScreen } from './king/HomeScreen';
import { LoggedScreen } from './king/LoggedScreen';
import { AboutPage } from './pages/AboutPage';
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
  about: { id: 'title.about', defaultMessage: 'About · King of Wees', description: 'Browser tab title of the About page' },
  privacy: { id: 'title.privacy', defaultMessage: 'Privacy · King of Wees', description: 'Browser tab title of the Privacy page' },
});

const titleOf = (route: Route) => titles[route];

const REFRESH_TIMES_EVERY_MS = 30_000;

type Screen = { name: 'home' } | { name: 'feed' } | { name: 'logged'; event: KingEventView };
type Props = { api?: typeof kingApi; reporterKey: string; now?: () => Date };

function App({ api = kingApi, reporterKey, now = () => new Date() }: Props) {
  const [status, setStatus] = useState<KingStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [undoFailed, setUndoFailed] = useState(false);
  const [busy, setBusy] = useState(false);
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

  // Re-render so "5 minutes ago" keeps moving while the page is open.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_TIMES_EVERY_MS);
    return () => clearInterval(id);
  }, []);

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
    setScreen({ name: 'home' });
  };

  const goHome = () => run(showFreshHome);

  const logFeeding = (foods: Food[]) =>
    run(async () => setScreen({ name: 'logged', event: await api.logFeeding({ reporterKey, foods }) }));

  const logSighting = () =>
    run(async () => setScreen({ name: 'logged', event: await api.logSighting({ reporterKey }) }));

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
  if (route === 'about') {
    content = <AboutPage />;
  } else if (route === 'privacy') {
    content = <PrivacyPage />;
  } else if (screen.name === 'feed') {
    content = <FeedScreen busy={busy} onLog={logFeeding} onBack={goHome} />;
    withFooter = false;
  } else if (screen.name === 'logged') {
    const event = screen.event;
    content = (
      <LoggedScreen event={event} undoFailed={undoFailed} busy={busy} onUndo={() => undo(event)} onDone={goHome} />
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
      <HomeScreen status={status} now={now()} busy={busy} onFed={() => setScreen({ name: 'feed' })} onSeen={logSighting} />
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
