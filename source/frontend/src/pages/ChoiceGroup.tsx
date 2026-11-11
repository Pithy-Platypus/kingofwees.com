import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { CheckIcon } from '../king/icons';

export type Choice<T> = { value: T; label: MessageDescriptor };

// The chosen button is filled and checked, so the choice never relies on color alone.
export function ChoiceGroup<T>({ label, choices, chosen, onChoose }: { label: MessageDescriptor; choices: Choice<T>[]; chosen: T; onChoose: (value: T) => void }) {
  const intl = useIntl();
  return (
    <div role="group" aria-label={intl.formatMessage(label)} className="choice-group">
      {choices.map(({ value, label: text }) => (
        <button key={String(value)} type="button" className="choice-button" aria-pressed={value === chosen} onClick={() => onChoose(value)}>
          {value === chosen && <CheckIcon className="button-icon" />}
          <FormattedMessage {...text} />
        </button>
      ))}
    </div>
  );
}
