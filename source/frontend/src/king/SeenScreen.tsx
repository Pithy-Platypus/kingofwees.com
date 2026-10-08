import { useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { BackIcon, EyeIcon } from './icons';
import { currentPosition, type GeoPoint, type Geolocator } from './location';
import { MapView } from './MapView';
import { place } from './messages';

const m = defineMessages({
  title: { id: 'seen.title', defaultMessage: 'Where is King?', description: 'Heading of the sighting place screen' },
  hint: {
    id: 'seen.hint',
    defaultMessage: 'Helps neighbors know where he hangs out. We only keep it to about a block.',
    description: 'Why a place is asked for, and that it is rounded',
  },
  mapLabel: { id: 'seen.mapLabel', defaultMessage: 'Map: tap where you saw King', description: 'Accessible name of the map' },
  logHere: { id: 'seen.logHere', defaultMessage: 'Log sighting here', description: 'Logs the sighting at the place picked on the map' },
  skip: { id: 'seen.skip', defaultMessage: 'Skip', description: 'Logs the sighting without a place' },
});

type Props = {
  mapCenter: GeoPoint | null;
  geolocation: Geolocator | undefined;
  busy: boolean;
  onLog: (location?: GeoPoint) => void;
  onBack: () => void;
};

export function SeenScreen({ mapCenter, geolocation, busy, onLog, onBack }: Props) {
  const intl = useIntl();
  const heading = useRef<HTMLHeadingElement>(null);
  const [picked, setPicked] = useState<GeoPoint | null>(null);
  const [locationFailed, setLocationFailed] = useState(false);
  useEffect(() => heading.current?.focus(), []);

  const logWhereIAm = async () => {
    try {
      onLog(await currentPosition(geolocation));
    } catch {
      setLocationFailed(true);
    }
  };

  return (
    <main className="app-screen">
      <button type="button" className="back-button" onClick={onBack}>
        <BackIcon className="button-icon" />
        <FormattedMessage {...place.back} />
      </button>
      <h1 ref={heading} tabIndex={-1} className="screen-title">
        <FormattedMessage {...m.title} />
      </h1>
      <p className="screen-hint">
        <FormattedMessage {...m.hint} />
      </p>
      {locationFailed && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...place.locationFailed} />
        </div>
      )}
      <button type="button" className="place-button" disabled={busy} onClick={() => void logWhereIAm()}>
        <EyeIcon className="button-icon" />
        <FormattedMessage {...place.nearNow} />
      </button>
      {mapCenter && (
        <MapView
          center={mapCenter}
          label={intl.formatMessage(m.mapLabel)}
          markers={picked ? [{ point: picked, kind: 'picked' }] : []}
          onPick={setPicked}
        />
      )}
      {picked && (
        <button type="button" className="log-here-button" disabled={busy} onClick={() => onLog(picked)}>
          <FormattedMessage {...m.logHere} />
        </button>
      )}
      <button type="button" className="skip-button" disabled={busy} onClick={() => onLog()}>
        <FormattedMessage {...m.skip} />
      </button>
    </main>
  );
}
