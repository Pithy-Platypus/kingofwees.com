import { useEffect, useRef } from 'react';
import { defineMessages, FormattedMessage } from 'react-intl';
import type { KingEventView } from './api';
import { CheckIcon, UndoIcon } from './icons';

const m = defineMessages({
  fedTitle: { id: 'logged.fed.title', defaultMessage: 'Feast logged!', description: 'Heading after logging a feeding' },
  fedDetail: { id: 'logged.fed.detail', defaultMessage: 'King was fed just now. Thank you!', description: 'Confirmation after logging a feeding' },
  seenTitle: { id: 'logged.seen.title', defaultMessage: 'Thanks for spotting King!', description: 'Heading after logging a sighting' },
  seenDetail: { id: 'logged.seen.detail', defaultMessage: 'Everyone can see he was spotted just now.', description: 'Confirmation after logging a sighting' },
  undo: { id: 'logged.undo', defaultMessage: 'Undo', description: 'Remove the entry just logged' },
  done: { id: 'logged.done', defaultMessage: 'Done', description: 'Return home' },
  undoExpired: {
    id: 'logged.undoExpired',
    defaultMessage: 'It’s too late to undo — entries can only be undone for 10 minutes.',
    description: 'Shown when the server refuses an undo because the entry is older than 10 minutes',
  },
});

type Props = { event: KingEventView; undoFailed: boolean; busy: boolean; onUndo: () => void; onDone: () => void };

export function LoggedScreen({ event, undoFailed, busy, onUndo, onDone }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const fed = event.kind === 'fed';

  return (
    <main className="app-screen logged-screen">
      <img src={fed ? '/king/king-licking.jpg' : '/king/king-sitting.jpg'} alt="" className="logged-photo" />
      <h1 ref={heading} tabIndex={-1} className="screen-title">
        <FormattedMessage {...(fed ? m.fedTitle : m.seenTitle)} />
      </h1>
      <p>
        <FormattedMessage {...(fed ? m.fedDetail : m.seenDetail)} />
      </p>
      {undoFailed && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.undoExpired} />
        </div>
      )}
      <div className="logged-actions">
        <button type="button" className="undo-button" disabled={busy || undoFailed} onClick={onUndo}>
          <UndoIcon className="button-icon" />
          <FormattedMessage {...m.undo} />
        </button>
        <button type="button" className="done-button" onClick={onDone}>
          <CheckIcon className="button-icon" />
          <FormattedMessage {...m.done} />
        </button>
      </div>
    </main>
  );
}
