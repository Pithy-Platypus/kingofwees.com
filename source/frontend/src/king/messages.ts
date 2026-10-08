import { defineMessages, type IntlShape } from 'react-intl';
import type { Food } from './api';
import { elapsedSince } from './time';

// Shared phrases. Screen-specific copy lives beside each screen.
export const common = defineMessages({
  appName: { id: 'app.name', defaultMessage: 'King of Wees', description: 'Site name shown in the header' },
  justNow: { id: 'time.justNow', defaultMessage: 'just now', description: 'Something happened less than a minute ago' },
  foodWet: { id: 'food.wet', defaultMessage: 'Wet food', description: 'Canned or pouch cat food' },
  foodDry: { id: 'food.dry', defaultMessage: 'Dry food', description: 'Kibble' },
  foodTreats: { id: 'food.treats', defaultMessage: 'Treats', description: 'Cat treats' },
});

export const foodMessage = (food: Food) =>
  ({ wet: common.foodWet, dry: common.foodDry, treats: common.foodTreats })[food];

/** "just now", "25 minutes ago", "1 day ago" — localized. */
export function formatWhen(intl: IntlShape, then: Date, now: Date): string {
  const elapsed = elapsedSince(then, now);
  return elapsed.kind === 'justNow'
    ? intl.formatMessage(common.justNow)
    : intl.formatRelativeTime(-elapsed.value, elapsed.unit, { numeric: 'always' });
}
