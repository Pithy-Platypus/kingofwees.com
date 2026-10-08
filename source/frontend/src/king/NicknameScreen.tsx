import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { defineMessages, FormattedMessage } from 'react-intl';

const m = defineMessages({
  title: { id: 'nickname.title', defaultMessage: 'What should neighbors call you?', description: 'Heading of the one-time name question' },
  hint: {
    id: 'nickname.hint',
    defaultMessage: 'A first name or nickname. Everyone can see it next to your entries.',
    description: 'Explains what kind of name to give and that it is public',
  },
  label: { id: 'nickname.label', defaultMessage: 'Your first name or nickname', description: 'Label of the name field' },
  save: { id: 'nickname.save', defaultMessage: 'Save', description: 'Keeps the typed name and carries on logging' },
  skip: { id: 'nickname.skip', defaultMessage: 'Skip', description: 'Carries on logging without a name' },
});

// Matches the server's reporterName limit.
const MAX_NAME_LENGTH = 40;

type Props = { initialName: string; onDone: (name: string) => void };

export function NicknameScreen({ initialName, onDone }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState(initialName);
  const inputId = useId();
  useEffect(() => heading.current?.focus(), []);

  const save = (e: FormEvent) => {
    e.preventDefault();
    onDone(name.trim());
  };

  return (
    <main className="app-screen">
      <h1 ref={heading} tabIndex={-1} className="screen-title">
        <FormattedMessage {...m.title} />
      </h1>
      <p className="screen-hint">
        <FormattedMessage {...m.hint} />
      </p>
      <form className="field-form" onSubmit={save}>
        <label htmlFor={inputId} className="field-label">
          <FormattedMessage {...m.label} />
        </label>
        <input
          id={inputId}
          className="field-input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="done-button">
          <FormattedMessage {...m.save} />
        </button>
      </form>
      <button type="button" className="skip-button" onClick={() => onDone('')}>
        <FormattedMessage {...m.skip} />
      </button>
    </main>
  );
}
