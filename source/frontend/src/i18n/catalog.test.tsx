import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { FeedScreen } from '../king/FeedScreen';
import { HomeScreen } from '../king/HomeScreen';
import { LoggedScreen } from '../king/LoggedScreen';
import { MapView } from '../king/MapView';
import { NicknameScreen } from '../king/NicknameScreen';
import { AboutPage } from '../pages/AboutPage';
import { PrivacyPage } from '../pages/PrivacyPage';
import { SeenScreen } from '../king/SeenScreen';
import { SpotScreen } from '../king/SpotScreen';
import { CENTER, event, fakeApi, NOW, spot } from '../test/fakeApi';
import { catalogs } from './catalogs';

const noop = () => {};
const status = {
  lastFed: event({ id: 'f', kind: 'fed', foods: ['wet'], reporterName: null, spotName: 'Corner', location: CENTER }),
  lastSeen: event({ id: 's', kind: 'seen', location: CENTER }),
  recent: [event({ id: 'f', kind: 'fed', foods: ['wet', 'treats'], spotName: 'Corner' }), event({ id: 's', kind: 'seen', location: CENTER })],
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
    ['home', <HomeScreen status={status} spots={[spot('c', 'Corner')]} mapCenter={CENTER} now={NOW} onFed={noop} onSeen={noop} />],
    [
      'feed',
      <FeedScreen
        busy={false}
        spots={[spot('c', 'Corner')]}
        spotId="c"
        draft={{ foods: ['wet'], leftOut: false }}
        onDraft={noop}
        onPickSpot={noop}
        onAddSpot={noop}
        onLog={noop}
        onBack={noop}
      />,
    ],
    ['where seen', <SeenScreen spots={[spot('c', 'Corner')]} mapCenter={CENTER} geolocation={undefined} busy={false} onLog={noop} onBack={noop} />],
    [
      'spots',
      <SpotScreen
        mapCenter={CENTER}
        geolocation={undefined}
        busy={false}
        onAdd={noop}
        onBack={noop}
      />,
    ],
    [
      'logged fed',
      <LoggedScreen event={event({ kind: 'fed' })} nickname="" undoFailed onUndo={noop} onDone={noop} onChangeName={noop} busy={false} />,
    ],
    [
      'logged seen',
      <LoggedScreen
        event={event({ kind: 'seen' })}
        nickname="Sunny"
        undoFailed={false}
        onUndo={noop}
        onDone={noop}
        onChangeName={noop}
        busy={false}
      />,
    ],
    ['name question', <NicknameScreen initialName="" onDone={noop} />],
    ['about', <AboutPage />],
    ['privacy', <PrivacyPage />],
    ['app loading', <App api={fakeApi()} reporterKey="k" now={() => NOW} />],
  ])('translates every message on the %s screen', (_name, ui) => {
    expect(() => renderInPseudoLocale(ui)).not.toThrow();
  });

  it('translates the controls Leaflet draws itself', () => {
    renderInPseudoLocale(<MapView center={CENTER} label="map" />);

    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
