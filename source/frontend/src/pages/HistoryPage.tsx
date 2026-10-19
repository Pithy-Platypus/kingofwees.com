import { defineMessages, FormattedMessage } from 'react-intl';
import type { AdminSession } from '../king/admin';
import type { kingApi, SpotView } from '../king/api';
import type { GeoPoint } from '../king/location';
import type { OwnUndo } from '../king/ownPosts';
import { HeatMapSection } from './HeatMapSection';
import { HistoryLog } from './HistoryLog';
import { PageShell } from './PageShell';
import { common } from '../king/messages';
import { Link } from '../routing/Link';

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
  /** This device's own recent entries get Undo. */
  own?: OwnUndo;
  /** An entry was undone here: Home's status should load again. */
  onUndone?: () => void;
};

export function HistoryPage({ api, spots, mapCenter, now, admin, own, onUndone }: Props) {
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      <Link to="photos" className="history-link">
        <FormattedMessage {...common.seePhotos} />
      </Link>
      <HeatMapSection api={api} spots={spots} mapCenter={mapCenter} />
      <HistoryLog api={api} spots={spots} now={now} admin={admin} own={own} onUndone={onUndone} />
    </PageShell>
  );
}
