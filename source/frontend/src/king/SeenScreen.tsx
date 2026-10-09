import { useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import type { SpotView } from './api';
import { BackIcon, EyeIcon } from './icons';
import { currentPosition, type GeoPoint, type Geolocator } from './location';
import { MapView } from './MapView';
import { place } from './messages';
import { useSpotsByName } from './useSpotsByName';

type Values = {
  title: NoMessageValues;
  hint: NoMessageValues;
  mapLabel: NoMessageValues;
  mapInstruction: NoMessageValues;
  logHere: NoMessageValues;
  spots: NoMessageValues;
  bySpot: { spot: string };
  noPlace: NoMessageValues;
};

const m = defineMessages<Values>({
  title: { id: 'seen.title', defaultMessage: 'Where is King?', description: 'Heading of the sighting place screen' },
  hint: {
    id: 'seen.hint',
    defaultMessage: 'Helps neighbors know where he hangs out. We only keep it to about a block.',
    description: 'Why a place is asked for, and that it is rounded',
  },
  mapLabel: { id: 'seen.mapLabel', defaultMessage: 'Map of where you saw King', description: 'Accessible name of the map' },
  mapInstruction: {
    id: 'seen.mapInstruction',
    defaultMessage: 'Or move the map so the pin is where you saw him.',
    description: 'Above the map, after the quicker choices: the pin stays in the middle and the map moves under it',
  },
  logHere: { id: 'seen.logHere', defaultMessage: 'Log sighting here', description: 'Logs the sighting at the place picked on the map' },
  spots: { id: 'seen.spots', defaultMessage: 'Spots', description: 'Accessible name of the list of feeding spots a sighting can be logged at' },
  bySpot: { id: 'seen.bySpot', defaultMessage: 'By {spot}', description: 'Logs the sighting at a feeding spot; {spot} is its name' },
  noPlace: { id: 'seen.noPlace', defaultMessage: 'Log without a place', description: 'Logs the sighting without a place' },
});

type Props = {
  spots: SpotView[];
  mapCenter: GeoPoint | null;
  geolocation: Geolocator | undefined;
  busy: boolean;
  onLog: (location?: GeoPoint) => void;
  onBack: () => void;
};

export function SeenScreen({ spots, mapCenter, geolocation, busy, onLog, onBack }: Props) {
  const intl = useIntl();
  const heading = useRef<HTMLHeadingElement>(null);
  const [picked, setPicked] = useState<GeoPoint | null>(null);
  const [locationFailed, setLocationFailed] = useState(false);
  const sorted = useSpotsByName(spots);
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
      <button type="button" className="where-now" disabled={busy} onClick={() => void logWhereIAm()}>
        <EyeIcon className="button-icon" />
        <FormattedMessage {...place.nearNow} />
      </button>
      {sorted.length > 0 && (
        <ul className="where-tiles" aria-label={intl.formatMessage(m.spots)}>
          {sorted.map((s) => (
            <li key={s.id}>
              <button type="button" className="where-tile" disabled={busy} onClick={() => onLog(s.location)}>
                <FormattedMessage {...m.bySpot} values={{ spot: s.name }} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {mapCenter && (
        <MapView
          center={mapCenter}
          label={intl.formatMessage(m.mapLabel)}
          instruction={intl.formatMessage(m.mapInstruction)}
          onPick={setPicked}
        />
      )}
      {picked && (
        <button type="button" className="log-here-button" disabled={busy} onClick={() => onLog(picked)}>
          <FormattedMessage {...m.logHere} />
        </button>
      )}
      <button type="button" className="no-place-button" disabled={busy} onClick={() => onLog()}>
        <FormattedMessage {...m.noPlace} />
      </button>
    </main>
  );
}
