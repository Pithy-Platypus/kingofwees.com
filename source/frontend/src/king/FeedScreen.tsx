import { useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage } from 'react-intl';
import type { Food } from './api';
import { BackIcon, BowlIcon, CheckIcon } from './icons';
import { foodMessage } from './messages';

const m = defineMessages({
  back: { id: 'feed.back', defaultMessage: 'Back', description: 'Return home without logging' },
  title: { id: 'feed.title', defaultMessage: 'What did King eat?', description: 'Heading over the food choices' },
  hint: {
    id: 'feed.hint',
    defaultMessage: 'Tap everything he had. Not sure? Just log it.',
    description: 'Explains that several foods can be picked, or none',
  },
  log: { id: 'feed.log', defaultMessage: 'Log feeding', description: 'Saves the feeding with the picked foods' },
});

const foods: Food[] = ['wet', 'dry', 'treats'];

type Props = { busy: boolean; onLog: (foods: Food[]) => void; onBack: () => void };

export function FeedScreen({ busy, onLog, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [picked, setPicked] = useState<Food[]>([]);
  useEffect(() => heading.current?.focus(), []);

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
      {/* Logged in menu order, whatever order they were tapped in. */}
      <button type="button" className="log-button" disabled={busy} onClick={() => onLog(foods.filter((f) => picked.includes(f)))}>
        <BowlIcon className="button-icon" />
        <FormattedMessage {...m.log} />
      </button>
    </main>
  );
}
