import { useEffect, useMemo, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor, type NoMessageValues } from 'react-intl';
import type { HeatCell, HeatLayer, HeatRange, kingApi, SpotView } from '../king/api';
import { describeCell, heatLevel, mergeNearSpots } from '../king/heat';
import { CheckIcon } from '../king/icons';
import type { GeoPoint } from '../king/location';
import { MapView, type MapMarker } from '../king/MapView';

type Values = {
  heading: NoMessageValues;
  show: NoMessageValues;
  seen: NoMessageValues;
  fed: NoMessageValues;
  range: NoMessageValues;
  days7: NoMessageValues;
  days30: NoMessageValues;
  all: NoMessageValues;
  mapSeen: NoMessageValues;
  mapFed: NoMessageValues;
  places: NoMessageValues;
  sightings: { count: number };
  feedings: { count: number };
  near: { spot: string };
  from: { distance: string; spot: string };
  nowhere: NoMessageValues;
  empty: NoMessageValues;
  loading: NoMessageValues;
  failed: NoMessageValues;
  tryAgain: NoMessageValues;
};

const m = defineMessages<Values>({
  heading: { id: 'heat.heading', defaultMessage: 'Where King goes', description: 'Heading over the heat map on the history page' },
  show: { id: 'heat.show', defaultMessage: 'Show', description: 'Accessible name of the seen/fed switch' },
  seen: { id: 'heat.seen', defaultMessage: 'Where he’s seen', description: 'Switch: heat map of sightings (including feedings where King was seen)' },
  fed: { id: 'heat.fed', defaultMessage: 'Where he’s fed', description: 'Switch: heat map of feedings, per feeding spot' },
  range: { id: 'heat.range', defaultMessage: 'Time range', description: 'Accessible name of the 7 days / 30 days / All switch' },
  days7: { id: 'heat.days7', defaultMessage: '7 days', description: 'Switch: only the last 7 days' },
  days30: { id: 'heat.days30', defaultMessage: '30 days', description: 'Switch: only the last 30 days' },
  all: { id: 'heat.all', defaultMessage: 'All', description: 'Switch: every entry ever logged' },
  mapSeen: { id: 'heat.mapSeen', defaultMessage: 'Map of where King is seen', description: 'Accessible name of the heat map, seen layer' },
  mapFed: { id: 'heat.mapFed', defaultMessage: 'Map of where King is fed', description: 'Accessible name of the heat map, fed layer' },
  places: { id: 'heat.places', defaultMessage: 'Places, busiest first', description: 'Accessible name of the list of places under the heat map' },
  sightings: {
    id: 'heat.sightings',
    defaultMessage: '{count, plural, one {# sighting} other {# sightings}}',
    description: 'How many times King was seen at one place',
  },
  feedings: {
    id: 'heat.feedings',
    defaultMessage: '{count, plural, one {# feeding} other {# feedings}}',
    description: 'How many times King was fed at one spot',
  },
  near: { id: 'heat.near', defaultMessage: 'Near {spot}', description: 'Place within about a block of a feeding spot; {spot} is its name' },
  from: {
    id: 'heat.from',
    defaultMessage: 'About {distance} from {spot}',
    description: 'Place farther from any feeding spot; {distance} is e.g. “1,100 ft” or “0.3 mi”, {spot} the closest spot’s name',
  },
  nowhere: {
    id: 'heat.nowhere',
    defaultMessage: 'Somewhere without a spot nearby',
    description: 'Place name when no feeding spots have been saved yet',
  },
  empty: { id: 'heat.empty', defaultMessage: 'Nothing with a place logged in this time.', description: 'Heat map has no places for the chosen layer and range' },
  loading: { id: 'heat.loading', defaultMessage: 'Loading the heat map…', description: 'Shown while the heat map loads' },
  failed: { id: 'heat.failed', defaultMessage: 'Couldn’t load the heat map.', description: 'Shown when the heat map cannot be loaded' },
  tryAgain: { id: 'heat.tryAgain', defaultMessage: 'Try again', description: 'Retry loading the heat map' },
});

type Choice<T> = { value: T; label: MessageDescriptor };

const layers: Choice<HeatLayer>[] = [
  { value: 'seen', label: m.seen },
  { value: 'fed', label: m.fed },
];
const ranges: Choice<HeatRange>[] = [
  { value: 7, label: m.days7 },
  { value: 30, label: m.days30 },
  { value: 'all', label: m.all },
];

// The chosen button is filled and checked, so the choice never relies on color alone.
function ChoiceGroup<T>({ label, choices, chosen, onChoose }: { label: MessageDescriptor; choices: Choice<T>[]; chosen: T; onChoose: (value: T) => void }) {
  const intl = useIntl();
  return (
    <div role="group" aria-label={intl.formatMessage(label)} className="choice-group">
      {choices.map(({ value, label: text }) => (
        <button key={String(value)} type="button" className="choice-button" aria-pressed={value === chosen} onClick={() => onChoose(value)}>
          {value === chosen && <CheckIcon className="button-icon" />}
          <FormattedMessage {...text} />
        </button>
      ))}
    </div>
  );
}

type Props = { api: Pick<typeof kingApi, 'getHeat'>; spots: SpotView[]; mapCenter: GeoPoint | null };

export function HeatMapSection({ api, spots, mapCenter }: Props) {
  const intl = useIntl();
  const [layer, setLayer] = useState<HeatLayer>('seen');
  const [range, setRange] = useState<HeatRange>(30);
  const [cells, setCells] = useState<HeatCell[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Only the latest choice may land: a slow answer to an earlier one is dropped.
  useEffect(() => {
    let latest = true;
    setFailed(false);
    api.getHeat(layer, range).then(
      (loaded) => latest && setCells(loaded),
      () => latest && setFailed(true),
    );
    return () => {
      latest = false;
    };
  }, [api, layer, range, attempt]);

  // The server counts per block; neighbors think in spots, so each spot's surroundings are one place.
  const places = useMemo(() => (cells ? mergeNearSpots(cells, spots) : null), [cells, spots]);
  const markers = useMemo<MapMarker[]>(() => {
    const max = Math.max(...(places ?? []).map((c) => c.count));
    return (places ?? []).map((c) => ({ point: c.location, kind: 'heat', level: heatLevel(c.count, max) }));
  }, [places]);

  const placeName = (cell: HeatCell) => {
    const place = describeCell(cell, spots);
    if (place.kind === 'spot') return place.name;
    if (place.kind === 'near') return intl.formatMessage(m.near, { spot: place.name });
    if (place.kind === 'from') {
      const distance = intl.formatNumber(place.distance.value, { style: 'unit', unit: place.distance.unit });
      return intl.formatMessage(m.from, { distance, spot: place.name });
    }
    return intl.formatMessage(m.nowhere);
  };

  let body;
  if (failed) {
    body = (
      <>
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.failed} />
        </div>
        <button type="button" className="done-button" onClick={() => setAttempt((a) => a + 1)}>
          <FormattedMessage {...m.tryAgain} />
        </button>
      </>
    );
  } else if (!places) {
    body = (
      <p role="status">
        <FormattedMessage {...m.loading} />
      </p>
    );
  } else if (places.length === 0) {
    body = (
      <p className="activity-detail">
        <FormattedMessage {...m.empty} />
      </p>
    );
  } else {
    body = (
      <ol className="heat-places" aria-label={intl.formatMessage(m.places)}>
        {places.map((c) => (
          <li key={`${c.location.latitude},${c.location.longitude},${c.spotName}`} className="heat-place">
            <span className="heat-place-name">{placeName(c)}</span>
            <span className="heat-place-count">
              <FormattedMessage {...(layer === 'seen' ? m.sightings : m.feedings)} values={{ count: c.count }} />
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <section aria-labelledby="heat-heading" className="heat-section">
      <h2 id="heat-heading" className="section-title">
        <FormattedMessage {...m.heading} />
      </h2>
      <ChoiceGroup label={m.show} choices={layers} chosen={layer} onChoose={setLayer} />
      <ChoiceGroup label={m.range} choices={ranges} chosen={range} onChoose={setRange} />
      {mapCenter && (
        <MapView center={mapCenter} label={intl.formatMessage(layer === 'seen' ? m.mapSeen : m.mapFed)} markers={markers} fit />
      )}
      {body}
    </section>
  );
}
