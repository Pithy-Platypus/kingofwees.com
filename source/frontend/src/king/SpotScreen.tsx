import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import type { SpotView } from './api';
import { BackIcon, CheckIcon } from './icons';
import { currentPosition, type GeoPoint, type Geolocator } from './location';
import { MapView } from './MapView';
import { place } from './messages';

const m = defineMessages({
  title: { id: 'spot.title', defaultMessage: 'Where did you feed him?', description: 'Heading of the feeding spot screen' },
  spots: { id: 'spot.list', defaultMessage: 'Spots', description: 'Accessible name of the list of saved feeding spots' },
  noSpot: { id: 'spot.none', defaultMessage: 'No spot', description: 'Logs the feeding without a spot' },
  somewhereNew: { id: 'spot.new', defaultMessage: 'Somewhere new', description: 'Opens the form to add a new feeding spot' },
  nameLabel: { id: 'spot.nameLabel', defaultMessage: 'Name this spot', description: 'Label of the new spot’s name field' },
  nameHint: {
    id: 'spot.nameHint',
    defaultMessage: 'Like “Blue house steps”. Everyone can see it, so leave out house numbers and family names.',
    description: 'Guidance for naming a spot without giving away who lives there',
  },
  mapLabel: { id: 'spot.mapLabel', defaultMessage: 'Map: tap where you fed King', description: 'Accessible name of the map' },
  placeSet: { id: 'spot.placeSet', defaultMessage: 'Place picked.', description: 'Confirms a place was chosen for the new spot' },
  save: { id: 'spot.save', defaultMessage: 'Save spot', description: 'Adds the new spot and uses it for this feeding' },
  needNameAndPlace: {
    id: 'spot.needNameAndPlace',
    defaultMessage: 'Give the spot a name and pick its place.',
    description: 'Shown when saving a new spot without a name or place',
  },
});

// Matches the server's spot name limit.
const MAX_NAME_LENGTH = 40;

type Props = {
  spots: SpotView[];
  mapCenter: GeoPoint | null;
  geolocation: Geolocator | undefined;
  busy: boolean;
  onChoose: (spotId: string | null) => void;
  onAdd: (name: string, location: GeoPoint) => void;
  onBack: () => void;
};

export function SpotScreen({ spots, mapCenter, geolocation, busy, onChoose, onAdd, onBack }: Props) {
  const intl = useIntl();
  const heading = useRef<HTMLHeadingElement>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<GeoPoint | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const nameId = useId();
  const hintId = useId();
  useEffect(() => heading.current?.focus(), []);

  // Sorted for the reader's language (the server returns them oldest first).
  const sorted = useMemo(() => {
    const collator = new Intl.Collator(intl.locale);
    return [...spots].sort((a, b) => collator.compare(a.name, b.name));
  }, [spots, intl.locale]);

  const pickWhereIAm = async () => {
    try {
      setPicked(await currentPosition(geolocation));
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
        <FormattedMessage {...m.title} />
      </h1>
      {sorted.length > 0 && (
        <ul className="spot-list" aria-label={intl.formatMessage(m.spots)}>
          {sorted.map((s) => (
            <li key={s.id}>
              <button type="button" className="spot-choice" onClick={() => onChoose(s.id)}>
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="spot-choice" onClick={() => onChoose(null)}>
        <FormattedMessage {...m.noSpot} />
      </button>
      {!adding ? (
        <button type="button" className="place-button" onClick={() => setAdding(true)}>
          <FormattedMessage {...m.somewhereNew} />
        </button>
      ) : (
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
            maxLength={MAX_NAME_LENGTH}
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
              label={intl.formatMessage(m.mapLabel)}
              markers={picked ? [{ point: picked, kind: 'picked' }] : []}
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
      )}
    </main>
  );
}
