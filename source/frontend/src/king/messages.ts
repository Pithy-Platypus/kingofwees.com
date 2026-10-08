import { defineMessages, type IntlShape } from 'react-intl';
import type { Food, KingEventView, SpotView } from './api';
import { nearestSpot } from './location';
import { elapsedSince } from './time';

// Shared phrases. Screen-specific copy lives beside each screen.
export const common = defineMessages({
  appName: { id: 'app.name', defaultMessage: 'King of Wees', description: 'Site name shown in the header' },
  justNow: { id: 'time.justNow', defaultMessage: 'just now', description: 'Something happened less than a minute ago' },
  foodWet: { id: 'food.wet', defaultMessage: 'Wet food', description: 'Canned or pouch cat food' },
  foodDry: { id: 'food.dry', defaultMessage: 'Dry food', description: 'Kibble' },
  foodTreats: { id: 'food.treats', defaultMessage: 'Treats', description: 'Cat treats' },
  aNeighbor: { id: 'home.aNeighbor', defaultMessage: 'a neighbor', description: 'Used as {name} when the reporter gave no name' },
});

export const foodMessage = (food: Food) =>
  ({ wet: common.foodWet, dry: common.foodDry, treats: common.foodTreats })[food];

// Picking a place (sightings and new spots).
export const place = defineMessages({
  nearNow: { id: 'place.nearNow', defaultMessage: 'I’m near him now', description: 'Uses the device’s location for a sighting' },
  useMyLocation: { id: 'place.useMyLocation', defaultMessage: 'Use where I am', description: 'Uses the device’s location for a new spot' },
  locationFailed: {
    id: 'place.locationFailed',
    defaultMessage: 'Couldn’t get your location.',
    description: 'The browser refused or could not find the device’s location',
  },
  back: { id: 'place.back', defaultMessage: 'Back', description: 'Leave the place screen without choosing' },
});

const where = defineMessages<{ atSpot: { spot: string }; nearSpot: { spot: string } }>({
  atSpot: { id: 'home.atSpot', defaultMessage: 'at {spot}', description: 'Activity detail; {spot} is the feeding spot’s name' },
  nearSpot: {
    id: 'home.nearSpot',
    defaultMessage: 'near {spot}',
    description: 'Activity detail for a sighting within about a block of a saved feeding spot; {spot} is its name',
  },
});

/** A feeding names its own spot; a sighting borrows the name of a spot within about a block, if any. */
export function placeOf(intl: IntlShape, e: KingEventView, spots: SpotView[]): string | null {
  if (e.spotName) return intl.formatMessage(where.atSpot, { spot: e.spotName });
  const near = e.kind === 'seen' && e.location ? nearestSpot(e.location, spots) : null;
  return near ? intl.formatMessage(where.nearSpot, { spot: near.name }) : null;
}

/** "just now", "25 minutes ago", "1 day ago" — localized. */
export function formatWhen(intl: IntlShape, then: Date, now: Date): string {
  const elapsed = elapsedSince(then, now);
  return elapsed.kind === 'justNow'
    ? intl.formatMessage(common.justNow)
    : intl.formatRelativeTime(-elapsed.value, elapsed.unit, { numeric: 'always' });
}
