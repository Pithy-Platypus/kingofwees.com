import { useEffect, useId, useRef } from 'react';
import { defineMessages, FormattedMessage, type NoMessageValues } from 'react-intl';
import type { Food, SpotView } from './api';
import { BackIcon, BowlIcon, CheckIcon } from './icons';
import { foodMessage } from './messages';
import { useSpotsByName } from './useSpotsByName';

type Values = {
  back: NoMessageValues;
  title: NoMessageValues;
  hint: NoMessageValues;
  log: NoMessageValues;
  leftOut: NoMessageValues;
  where: NoMessageValues;
  noSpot: NoMessageValues;
  newSpot: NoMessageValues;
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
  where: { id: 'feed.where', defaultMessage: 'Where did you feed him?', description: 'Heading over the feeding spot choices' },
  noSpot: { id: 'feed.noSpot', defaultMessage: 'No spot', description: 'Choice: log the feeding without a spot' },
  newSpot: { id: 'feed.newSpot', defaultMessage: 'Somewhere new', description: 'Opens the form to add a new feeding spot' },
});

/** A feeding being filled in; kept by the app so adding a spot midway doesn't lose it. */
export type FeedDraft = { foods: Food[]; leftOut: boolean };

const foods: Food[] = ['wet', 'dry', 'treats'];

type Props = {
  busy: boolean;
  spots: SpotView[];
  spotId: string | null;
  draft: FeedDraft;
  onDraft: (draft: FeedDraft) => void;
  onPickSpot: (spotId: string | null) => void;
  onAddSpot: () => void;
  onLog: (foods: Food[], sawKing: boolean) => void;
  onBack: () => void;
};

export function FeedScreen({ busy, spots, spotId, draft, onDraft, onPickSpot, onAddSpot, onLog, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const radioName = useId();
  const sorted = useSpotsByName(spots);
  // Feeding him usually means seeing him; only a tick (leftOut) says otherwise.
  const { foods: picked, leftOut } = draft;
  useEffect(() => heading.current?.focus(), []);

  const toggle = (food: Food) =>
    onDraft({ ...draft, foods: picked.includes(food) ? picked.filter((f) => f !== food) : [...picked, food] });

  const choices = [...sorted, { id: null, name: null }];

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
      <fieldset className="where-choices">
        <legend className="where-heading">
          <FormattedMessage {...m.where} />
        </legend>
        <div className="where-tiles">
          {choices.map((c) => (
            <label key={c.id ?? ''} className="where-tile">
              <input
                type="radio"
                className="where-radio"
                name={radioName}
                checked={spotId === c.id}
                onChange={() => onPickSpot(c.id)}
              />
              {spotId === c.id && <CheckIcon className="button-icon" />}
              {c.name ?? <FormattedMessage {...m.noSpot} />}
            </label>
          ))}
          <button type="button" className="where-tile where-tile-new" onClick={onAddSpot}>
            <FormattedMessage {...m.newSpot} />
          </button>
        </div>
      </fieldset>
      <label className="left-out">
        <input
          type="checkbox"
          className="left-out-box"
          checked={leftOut}
          onChange={(e) => onDraft({ ...draft, leftOut: e.target.checked })}
        />
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
