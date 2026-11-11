import { useState } from 'react';
import { defineMessages, FormattedMessage, type NoMessageValues } from 'react-intl';
import type { AdminSession } from '../king/admin';
import type { HeatRange, kingApi, SpotView } from '../king/api';
import type { GeoPoint } from '../king/location';
import type { OwnUndo } from '../king/ownPosts';
import { ChoiceGroup, type Choice } from './ChoiceGroup';
import { HabitsSection } from './HabitsSection';
import { HeatMapSection } from './HeatMapSection';
import { HistoryLog } from './HistoryLog';
import { PageShell } from './PageShell';

type Values = { title: NoMessageValues; range: NoMessageValues; days7: NoMessageValues; days30: NoMessageValues; all: NoMessageValues };

const m = defineMessages<Values>({
  title: { id: 'history.title', defaultMessage: 'King’s history', description: 'Heading of the history page (heat map, habits and every entry)' },
  range: { id: 'history.range', defaultMessage: 'Time range', description: 'Accessible name of the 7 days / 30 days / All switch over the heat map and the habit charts' },
  days7: { id: 'history.days7', defaultMessage: '7 days', description: 'Switch: only the last 7 days' },
  days30: { id: 'history.days30', defaultMessage: '30 days', description: 'Switch: only the last 30 days' },
  all: { id: 'history.all', defaultMessage: 'All', description: 'Switch: every entry ever logged' },
});

const ranges: Choice<HeatRange>[] = [
  { value: 7, label: m.days7 },
  { value: 30, label: m.days30 },
  { value: 'all', label: m.all },
];

type Props = {
  api: Pick<typeof kingApi, 'getHeat' | 'getHabits' | 'getHistory'>;
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
  // One range for the heat map and the habit charts (the calendar keeps its five weeks; the log is every entry).
  const [range, setRange] = useState<HeatRange>(30);
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      <ChoiceGroup label={m.range} choices={ranges} chosen={range} onChoose={setRange} />
      <HeatMapSection api={api} spots={spots} mapCenter={mapCenter} range={range} />
      <HabitsSection api={api} now={now} range={range} />
      <HistoryLog api={api} spots={spots} now={now} admin={admin} own={own} onUndone={onUndone} />
    </PageShell>
  );
}
