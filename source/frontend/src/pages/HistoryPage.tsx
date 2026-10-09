import { defineMessages, FormattedMessage } from 'react-intl';
import type { AdminSession } from '../king/admin';
import type { kingApi, SpotView } from '../king/api';
import type { GeoPoint } from '../king/location';
import { HeatMapSection } from './HeatMapSection';
import { HistoryLog } from './HistoryLog';
import { PageShell } from './PageShell';

const m = defineMessages({
  title: { id: 'history.title', defaultMessage: 'King’s history', description: 'Heading of the history page (heat map and every entry)' },
});

type Props = {
  api: Pick<typeof kingApi, 'getHeat' | 'getHistory'>;
  spots: SpotView[];
  mapCenter: GeoPoint | null;
  now: Date;
  /** Present when this device holds an accepted admin key: entries get hide buttons. */
  admin?: AdminSession;
};

export function HistoryPage({ api, spots, mapCenter, now, admin }: Props) {
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      <HeatMapSection api={api} spots={spots} mapCenter={mapCenter} />
      <HistoryLog api={api} spots={spots} now={now} admin={admin} />
    </PageShell>
  );
}
