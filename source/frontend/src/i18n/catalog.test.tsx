import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { FeedScreen } from '../king/FeedScreen';
import { HomeScreen } from '../king/HomeScreen';
import { LoggedScreen } from '../king/LoggedScreen';
import { event, fakeApi, NOW } from '../test/fakeApi';
import { catalogs } from './catalogs';

const noop = () => {};
const status = {
  lastFed: event({ id: 'f', kind: 'fed', foods: ['wet'], reporterName: null }),
  lastSeen: event({ id: 's', kind: 'seen' }),
  recent: [event({ id: 'f', kind: 'fed', foods: ['wet', 'treats'] }), event({ id: 's', kind: 'seen' })],
};

// If this fails with MISSING_TRANSLATION, run `bun run i18n` to regenerate the catalogs.
function renderInPseudoLocale(ui: ReactElement) {
  return render(
    <IntlProvider
      locale="en-XA"
      defaultLocale="en-US"
      messages={catalogs['en-XA']}
      onError={(error) => {
        throw error;
      }}
    >
      {ui}
    </IntlProvider>,
  );
}

describe('pseudo-locale catalog', () => {
  it.each<[string, ReactElement]>([
    ['home', <HomeScreen status={status} now={NOW} onFed={noop} onSeen={noop} />],
    ['feed', <FeedScreen busy={false} onLog={noop} onBack={noop} />],
    ['logged fed', <LoggedScreen event={event({ kind: 'fed' })} undoFailed onUndo={noop} onDone={noop} busy={false} />],
    ['logged seen', <LoggedScreen event={event({ kind: 'seen' })} undoFailed={false} onUndo={noop} onDone={noop} busy={false} />],
    ['app loading', <App api={fakeApi()} reporterKey="k" now={() => NOW} />],
  ])('translates every message on the %s screen', (_name, ui) => {
    expect(() => renderInPseudoLocale(ui)).not.toThrow();
  });
});
