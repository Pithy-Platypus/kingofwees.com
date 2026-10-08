import type { Ref } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import type { KingEventView, SpotView } from './api';
import { BowlIcon, EyeIcon } from './icons';
import { common, foodMessage, placeOf } from './messages';

type Values = { fedBy: { name: string }; seenBy: { name: string }; leftOut: NoMessageValues };

const m = defineMessages<Values>({
  fedBy: { id: 'home.fedBy', defaultMessage: 'Fed by {name}', description: 'Activity item; {name} is who fed King' },
  seenBy: { id: 'home.seenBy', defaultMessage: 'Seen by {name}', description: 'Activity item; {name} is who saw King' },
  leftOut: {
    id: 'activity.leftOut',
    defaultMessage: 'left food out',
    description: 'Activity detail for a feeding where the feeder only left food out and didn’t see King',
  },
});

type Props = { event: KingEventView; spots: SpotView[]; time: string; ref?: Ref<HTMLLIElement> };

/** One line of activity, on Home (Lately) and the history page: who, what, where, when. */
export function ActivityItem({ event: e, spots, time, ref }: Props) {
  const intl = useIntl();
  const name = e.reporterName ?? intl.formatMessage(common.aNeighbor);
  // "Wet food and Treats · at Corner · left food out": whichever parts the entry has.
  const detail = [
    e.foods.length > 0 && intl.formatList(e.foods.map((f) => intl.formatMessage(foodMessage(f)))),
    placeOf(intl, e, spots),
    !e.sawKing && intl.formatMessage(m.leftOut),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li ref={ref} tabIndex={ref ? -1 : undefined} className="activity-item">
      <span className={`activity-icon ${e.kind === 'fed' ? 'bg-secondary text-secondary-content' : 'bg-primary text-primary-content'}`}>
        {e.kind === 'fed' ? <BowlIcon /> : <EyeIcon />}
      </span>
      <span className="activity-text">
        <strong>
          {e.kind === 'fed' ? <FormattedMessage {...m.fedBy} values={{ name }} /> : <FormattedMessage {...m.seenBy} values={{ name }} />}
        </strong>
        {detail && <span className="activity-detail">{detail}</span>}
      </span>
      <span className="activity-time">{time}</span>
    </li>
  );
}
