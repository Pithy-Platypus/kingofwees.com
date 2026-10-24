import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { SPOT_NAME_MAX_LENGTH } from './api';
import { BackIcon, CheckIcon } from './icons';
import { currentPosition, type GeoPoint, type Geolocator } from './location';
import { MapView } from './LazyMapView';
import { place } from './messages';

const m = defineMessages({
  nameLabel: { id: 'spot.nameLabel', defaultMessage: 'Name this spot', description: 'Label of the new spot’s name field' },
  nameHint: {
    id: 'spot.nameHint',
    defaultMessage: 'Like “Blue house steps”. Everyone can see it, so leave out house numbers and family names.',
    description: 'Guidance for naming a spot without giving away who lives there',
  },
  placeSet: { id: 'spot.placeSet', defaultMessage: 'Place picked.', description: 'Confirms a place was chosen for the new spot' },
  save: { id: 'spot.save', defaultMessage: 'Save spot', description: 'Adds the new spot and uses it for this feeding or sighting' },
  needNameAndPlace: {
    id: 'spot.needNameAndPlace',
    defaultMessage: 'Give the spot a name and move the map to its place.',
    description: 'Shown when saving a new spot without a name or place',
  },
});

// The screen that sent the visitor decides the wording: a feeder is placing where he ate, a spotter where he was.
const wording = {
  feed: defineMessages({
    title: { id: 'spot.title', defaultMessage: 'Add a feeding spot', description: 'Heading of the screen that adds a new spot, reached from a feeding' },
    mapLabel: { id: 'spot.mapLabel', defaultMessage: 'Map of where you fed King', description: 'Accessible name of the map' },
    mapInstruction: {
      id: 'spot.mapInstruction',
      defaultMessage: 'Move the map so the pin is where you fed him.',
      description: 'Above the map: the pin stays in the middle and the map moves under it',
    },
  }),
  seen: defineMessages({
    title: { id: 'spot.seen.title', defaultMessage: 'Add a spot', description: 'Heading of the screen that adds a new spot, reached from a sighting' },
    mapLabel: { id: 'spot.seen.mapLabel', defaultMessage: 'Map of where you saw King', description: 'Accessible name of the map' },
    mapInstruction: {
      id: 'spot.seen.mapInstruction',
      defaultMessage: 'Move the map so the pin is where you saw him.',
      description: 'Above the map: the pin stays in the middle and the map moves under it',
    },
  }),
};

type Props = {
  from: keyof typeof wording;
  mapCenter: GeoPoint | null;
  geolocation: Geolocator | undefined;
  busy: boolean;
  onAdd: (name: string, location: GeoPoint) => void;
  onBack: () => void;
};

export function SpotScreen({ from, mapCenter, geolocation, busy, onAdd, onBack }: Props) {
  const w = wording[from];
  const intl = useIntl();
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<GeoPoint | null>(null);
  const [here, setHere] = useState<GeoPoint | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const nameId = useId();
  const hintId = useId();
  useEffect(() => heading.current?.focus(), []);


  const pickWhereIAm = async () => {
    try {
      // Moving the map there picks it, so the pin always shows the place that will be saved.
      setHere(await currentPosition(geolocation));
      setLocationFailed(false);
    } catch {
      setLocationFailed(true);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !picked) {
      setIncomplete(true);
      return;
    }
    onAdd(name.trim(), picked);
  };

  return (
    <main className="app-screen">
      <button type="button" className="back-button" onClick={onBack}>
        <BackIcon className="button-icon" />
        <FormattedMessage {...place.back} />
      </button>
      <h1 ref={heading} tabIndex={-1} className="screen-title">
        <FormattedMessage {...w.title} />
      </h1>
      <form className="field-form" onSubmit={save}>
        <label htmlFor={nameId} className="field-label">
          <FormattedMessage {...m.nameLabel} />
        </label>
        <p id={hintId} className="screen-hint">
          <FormattedMessage {...m.nameHint} />
        </p>
        <input
          id={nameId}
          aria-describedby={hintId}
          className="field-input"
          value={name}
          maxLength={SPOT_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />
        {locationFailed && (
          <div role="alert" className="alert alert-error">
            <FormattedMessage {...place.locationFailed} />
          </div>
        )}
        <button type="button" className="place-button" onClick={() => void pickWhereIAm()}>
          <FormattedMessage {...place.useMyLocation} />
        </button>
        {mapCenter && (
          <MapView
            center={mapCenter}
            label={intl.formatMessage(w.mapLabel)}
            instruction={intl.formatMessage(w.mapInstruction)}
            goTo={here}
            onPick={setPicked}
          />
        )}
        <p role="status" className="place-status">
          {picked && (
            <>
              <CheckIcon className="button-icon" />
              <FormattedMessage {...m.placeSet} />
            </>
          )}
        </p>
        {incomplete && (
          <div role="alert" className="alert alert-error">
            <FormattedMessage {...m.needNameAndPlace} />
          </div>
        )}
        <button type="submit" className="done-button" disabled={busy}>
          <FormattedMessage {...m.save} />
        </button>
      </form>
    </main>
  );
}
