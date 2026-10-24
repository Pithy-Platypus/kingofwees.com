import type { RootOptions } from 'react-dom/client';

// When the page itself breaks (a script error, a promise nobody caught, a screen that failed to draw), the server is
// told what broke and on which page: no address, device key or query string. Failed API calls aren't reported — the
// server already records them. Why → docs/patterns/telemetry.md.

export type Kind = 'error' | 'rejection' | 'render';
export type Report = (kind: Kind, error: unknown) => void;

/** A page that keeps failing sends no more than this. */
export const MAX_REPORTS = 5;
// The server's limits (ClientDiagnostic.Max*Length): a longer report would be refused whole.
const MAX_MESSAGE = 500;
const MAX_STACK = 1500;
const MAX_PATH = 200;
const URL = '/api/client-diagnostics';

function describe(error: unknown) {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack ?? null };
  return { message: (error === undefined ? '' : String(error)).trim() || 'Unknown error', stack: null };
}

export function createReporter(send: (body: string) => void, location: Pick<Location, 'pathname'>, version: string): Report {
  const sent = new Set<string>();
  return (kind, error) => {
    const { message, stack } = describe(error);
    const key = `${kind}:${message}`;
    if (sent.size >= MAX_REPORTS || sent.has(key)) return;
    sent.add(key);
    send(
      JSON.stringify({
        kind,
        message: message.slice(0, MAX_MESSAGE),
        stack: stack?.slice(0, MAX_STACK) ?? null,
        path: location.pathname.slice(0, MAX_PATH),
        version,
      }),
    );
  };
}

/** A beacon outlasts the page being left or reloaded; JSON, so another site can't send one without asking first. */
export function sendDiagnostic(body: string) {
  if (navigator.sendBeacon?.(URL, new Blob([body], { type: 'application/json' }))) return;
  fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

export function watchErrors(target: EventTarget, report: Report) {
  target.addEventListener('error', (event) => {
    const { error, message } = event as ErrorEvent;
    report('error', error ?? message);
  });
  target.addEventListener('unhandledrejection', (event) => report('rejection', (event as PromiseRejectionEvent).reason));
}

/** The flag that says this build already reloaded once for a missing chunk; sessionStorage, so a new tab starts over. */
export const PRELOAD_RELOADED = 'king.preloadReloaded';

/**
 * A page open from before a deploy asks for chunks the new build no longer has (Vite's `vite:preloadError`): reload
 * once, which fetches the new page. A page that still fails after that is a real breakage, and is reported instead.
 */
export function watchPreloadError(target: EventTarget, storage: Storage | undefined, version: string, report: Report, reload: () => void) {
  target.addEventListener('vite:preloadError', (event) => {
    event.preventDefault(); // the error isn't thrown; this handler decides
    const reloaded = read(storage) === version;
    write(storage, version);
    if (reloaded) report('render', (event as Event & { payload?: unknown }).payload);
    else reload();
  });
}

function read(storage: Storage | undefined) {
  try {
    return storage?.getItem(PRELOAD_RELOADED) ?? null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, version: string) {
  try {
    storage?.setItem(PRELOAD_RELOADED, version);
  } catch {
    // Private browsing with storage refused: the reload still happens; a loop would then report after MAX_REPORTS at worst.
  }
}

/** For createRoot: what an error boundary caught is a screen that failed to draw. Still logged for developers. */
export const rootErrorHandlers = (report: Report): Required<Pick<RootOptions, 'onCaughtError' | 'onUncaughtError'>> => ({
  onCaughtError: (error) => {
    console.error(error);
    report('render', error);
  },
  onUncaughtError: (error) => {
    console.error(error);
    report('error', error);
  },
});
