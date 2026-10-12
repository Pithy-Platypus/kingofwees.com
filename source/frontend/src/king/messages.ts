import { defineMessages, type IntlShape } from 'react-intl';
import type { Food, KingEventView, PhotoView, SpotView } from './api';
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
  seePhotos: { id: 'link.seePhotos', defaultMessage: 'See every photo', description: 'Link from the history page to the page with every photo of King' },
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

/** Photo phrases used on more than one screen. */
export const photoPhrases = defineMessages({
  reading: { id: 'photo.reading', defaultMessage: 'Getting your photo ready…', description: 'Shown while the picked photo is shrunk' },
  retry: { id: 'photo.retry', defaultMessage: 'Retry', description: 'Sends the same photo again' },
});

const alts = defineMessages<{
  entry: { kind: string; name: string; when: string };
  entryAt: { kind: string; name: string; place: string; when: string };
  shared: { name: string; day: string };
}>({
  entry: {
    id: 'photo.alt.entry',
    defaultMessage: 'Photo from a {kind, select, fed {feeding} other {sighting}} by {name}, {when}',
    description: 'Alt text of a photo added with an entry that has no place; {name} is who posted it or “a neighbor”, {when} its date and time',
  },
  entryAt: {
    id: 'photo.alt.entryAt',
    defaultMessage: 'Photo from a {kind, select, fed {feeding} other {sighting}} by {name} {place}, {when}',
    description: 'Alt text of a photo added with an entry; {place} is “at Porch” or “near Porch”, as in history',
  },
  shared: {
    id: 'photo.alt.shared',
    defaultMessage: 'Photo shared by {name} on {day}',
    description: 'Alt text of a photo shared on its own (not with an entry); {day} is the date it was shared',
  },
});

/** How a photo on an entry was added, like the entry's history line; the year always, so an old photo never reads as new. */
export function entryPhotoAlt(intl: IntlShape, e: KingEventView, spots: SpotView[]): string {
  const name = e.reporterName ?? intl.formatMessage(common.aNeighbor);
  const when = intl.formatDate(new Date(e.occurredAt), { dateStyle: 'medium', timeStyle: 'short' });
  const place = placeOf(intl, e, spots);
  return place
    ? intl.formatMessage(alts.entryAt, { kind: e.kind, name, place, when })
    : intl.formatMessage(alts.entry, { kind: e.kind, name, when });
}

/** Alt text for any photo: by its entry, or as shared on its own. */
export function photoAlt(intl: IntlShape, p: PhotoView, spots: SpotView[]): string {
  if (p.event) return entryPhotoAlt(intl, p.event, spots);
  const name = p.reporterName ?? intl.formatMessage(common.aNeighbor);
  return intl.formatMessage(alts.shared, { name, day: intl.formatDate(new Date(p.postedAt), { dateStyle: 'medium' }) });
}
