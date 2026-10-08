import { useEffect, useRef, useState, type ReactNode } from 'react';
import { defineMessages, FormattedMessage, type MessageTag, type NoMessageValues } from 'react-intl';
import type { Food } from './api';
import { BackIcon, BowlIcon, CheckIcon } from './icons';
import { foodMessage } from './messages';

type Values = {
  back: NoMessageValues;
  title: NoMessageValues;
  hint: NoMessageValues;
  log: NoMessageValues;
  leftOut: NoMessageValues;
  atSpot: { spot: string; change: MessageTag };
  noSpot: { change: MessageTag };
};

const m = defineMessages<Values>({
  back: { id: 'feed.back', defaultMessage: 'Back', description: 'Return home without logging' },
  title: { id: 'feed.title', defaultMessage: 'What did King eat?', description: 'Heading over the food choices' },
  hint: {
    id: 'feed.hint',
    defaultMessage: 'Tap everything he had. Not sure? Just log it.',
    description: 'Explains that several foods can be picked, or none',
  },
  log: { id: 'feed.log', defaultMessage: 'Log feeding', description: 'Saves the feeding with the picked foods' },
  leftOut: {
    id: 'feed.leftOut',
    defaultMessage: 'I left food out (didn’t see him)',
    description: 'Checkbox: the feeder put food out but did not see King, so it does not count as a sighting',
  },
  atSpot: {
    id: 'feed.atSpot',
    defaultMessage: 'At {spot} · <change>change</change>',
    description: 'The feeding spot that will be logged; {spot} is its name. <change> becomes a button.',
  },
  noSpot: {
    id: 'feed.noSpot',
    defaultMessage: 'Where? <change>Pick a spot</change>',
    description: 'No feeding spot picked yet. <change> becomes a button.',
  },
});

const foods: Food[] = ['wet', 'dry', 'treats'];

type Props = {
  busy: boolean;
  spotName: string | null;
  onLog: (foods: Food[], sawKing: boolean) => void;
  onChangeSpot: () => void;
  onBack: () => void;
};

export function FeedScreen({ busy, spotName, onLog, onChangeSpot, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [picked, setPicked] = useState<Food[]>([]);
  // Feeding him usually means seeing him; only a tick says otherwise.
  const [leftOut, setLeftOut] = useState(false);
  useEffect(() => heading.current?.focus(), []);

  const changeSpot = (chunks: ReactNode[]) => (
    <button type="button" className="text-button" onClick={onChangeSpot}>
      {chunks}
    </button>
  );

  const toggle = (food: Food) =>
    setPicked((current) => (current.includes(food) ? current.filter((f) => f !== food) : [...current, food]));

  return (
    <main className="app-screen">
      <button type="button" className="back-button" onClick={onBack}>
        <BackIcon className="button-icon" />
        <FormattedMessage {...m.back} />
      </button>
      <h1 ref={heading} tabIndex={-1} className="screen-title">
        <FormattedMessage {...m.title} />
      </h1>
      <p className="screen-hint">
        <FormattedMessage {...m.hint} />
      </p>
      <div className="food-choices">
        {foods.map((food) => (
          <button
            key={food}
            type="button"
            className="food-choice"
            aria-pressed={picked.includes(food)}
            onClick={() => toggle(food)}
          >
            {picked.includes(food) && <CheckIcon className="button-icon" />}
            <FormattedMessage {...foodMessage(food)} />
          </button>
        ))}
      </div>
      <p className="logging-as">
        {spotName ? (
          <FormattedMessage {...m.atSpot} values={{ spot: spotName, change: changeSpot }} />
        ) : (
          <FormattedMessage {...m.noSpot} values={{ change: changeSpot }} />
        )}
      </p>
      <label className="left-out">
        <input type="checkbox" className="left-out-box" checked={leftOut} onChange={(e) => setLeftOut(e.target.checked)} />
        <FormattedMessage {...m.leftOut} />
      </label>
      {/* Logged in menu order, whatever order they were tapped in. */}
      <button
        type="button"
        className="log-button"
        disabled={busy}
        onClick={() => onLog(foods.filter((f) => picked.includes(f)), !leftOut)}
      >
        <BowlIcon className="button-icon" />
        <FormattedMessage {...m.log} />
      </button>
    </main>
  );
}
