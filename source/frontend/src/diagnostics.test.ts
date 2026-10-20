import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReporter, MAX_REPORTS, rootErrorHandlers, sendDiagnostic, watchErrors, type Report } from './diagnostics';

const version = '2026.10.20+0123456789ab';
const reporter = (pathname = '/history') => {
  const sent: Record<string, unknown>[] = [];
  const report = createReporter((body) => sent.push(JSON.parse(body)), { pathname }, version);
  return { report, sent };
};

describe('createReporter', () => {
  it('sends what broke, on which page and in which build', () => {
    const { report, sent } = reporter('/photos');
    const error = new TypeError('Cannot read properties of null');

    report('render', error);

    expect(sent).toEqual([
      { kind: 'render', message: 'Cannot read properties of null', stack: error.stack, path: '/photos', version },
    ]);
  });

  it('describes a thrown value that is not an Error', () => {
    const { report, sent } = reporter();

    report('rejection', 'quota exceeded');
    report('rejection', undefined);
    report('rejection', '   ');
    report('error', new Error(''));

    expect(sent.map((s) => [s.message, s.stack])).toEqual([
      ['quota exceeded', null],
      ['Unknown error', null],
      ['Error', expect.stringContaining('Error')],
    ]);
  });

  it('cuts text to what the server accepts', () => {
    const { report, sent } = reporter('/' + 'p'.repeat(300));
    const error = new Error('m'.repeat(600));
    error.stack = 's'.repeat(5000);

    report('error', error);

    expect(sent[0]).toMatchObject({ message: 'm'.repeat(500), stack: 's'.repeat(4000), path: '/' + 'p'.repeat(199) });
  });

  it('sends the same failure once', () => {
    const { report, sent } = reporter();

    report('error', new Error('Boom'));
    report('error', new Error('Boom'));
    report('render', new Error('Boom'));

    expect(sent.map((s) => s.kind)).toEqual(['error', 'render']);
  });

  it(`sends at most ${MAX_REPORTS} a page load`, () => {
    const { report, sent } = reporter();

    for (let i = 0; i < MAX_REPORTS + 3; i++) report('error', new Error(`Boom ${i}`));

    expect(sent).toHaveLength(MAX_REPORTS);
  });
});

describe('sendDiagnostic', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a beacon as JSON, which outlasts leaving the page', async () => {
    const sendBeacon = vi.fn<(url: string, data: Blob) => boolean>(() => true);
    const fetch = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('fetch', fetch);

    sendDiagnostic('{"kind":"error"}');

    const [url, data] = sendBeacon.mock.calls[0];
    expect(url).toBe('/api/client-diagnostics');
    expect(data.type).toBe('application/json');
    expect(await data.text()).toBe('{"kind":"error"}');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to fetch when the browser has no beacon or refuses it', () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    vi.stubGlobal('fetch', fetch);

    for (const navigator of [{}, { sendBeacon: () => false }]) {
      vi.stubGlobal('navigator', navigator);
      sendDiagnostic('{"kind":"error"}');
    }

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('/api/client-diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"kind":"error"}',
      keepalive: true,
    });
  });
});

describe('watchErrors', () => {
  it('reports script errors and promises nobody caught', () => {
    const target = new EventTarget();
    const report = vi.fn<Report>();
    const error = new Error('Boom');
    watchErrors(target, report);

    target.dispatchEvent(Object.assign(new Event('error'), { error, message: 'Uncaught Error: Boom' }));
    target.dispatchEvent(Object.assign(new Event('error'), { error: null, message: 'Script error.' }));
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'nope' }));

    expect(report.mock.calls).toEqual([
      ['error', error],
      ['error', 'Script error.'],
      ['rejection', 'nope'],
    ]);
  });
});

describe('rootErrorHandlers', () => {
  it('reports what an error boundary caught as a render failure, and the rest as errors', () => {
    const report = vi.fn<Report>();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlers = rootErrorHandlers(report);
    const caught = new Error('Caught');
    const uncaught = new Error('Uncaught');

    handlers.onCaughtError(caught, { componentStack: '' });
    handlers.onUncaughtError(uncaught, { componentStack: '' });

    expect(report.mock.calls).toEqual([
      ['render', caught],
      ['error', uncaught],
    ]);
    expect(quiet).toHaveBeenCalledTimes(2);
    quiet.mockRestore();
  });
});
