import { useEffect, useId, useRef, useState } from 'react';
import { defineMessages, FormattedMessage } from 'react-intl';
import { HIDE_NOTE_MAX_LENGTH, HIDE_REASONS, type HideReason } from '../king/admin';
import { adminMessages } from './adminMessages';

const m = defineMessages({
  confirmShared: {
    id: 'admin.confirmSharedPhoto',
    defaultMessage: 'Hide this photo from everyone?',
    description: 'Asked before hiding a photo shared on its own (no entry)',
  },
});

type Props = {
  /** A photo on an entry: the question says the entry stays. */
  onEntry: boolean;
  busy: boolean;
  onHide: (reason: HideReason, note: string | null) => void;
  onCancel: () => void;
};

/**
 * "Hide this photo", asked in place with why: /admin later lists hidden photos in words only (never the picture), so
 * the reason is how a later admin tells them apart and understands each one.
 */
export function HidePhotoForm({ onEntry, busy, onHide, onCancel }: Props) {
  const question = useRef<HTMLParagraphElement>(null);
  const name = useId();
  const noteId = useId();
  const [reason, setReason] = useState<HideReason | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => question.current?.focus(), []);

  const noteRequired = reason === 'other';
  const ready = reason !== null && (!noteRequired || note.trim() !== '');

  return (
    <>
      <p ref={question} tabIndex={-1} className="admin-question">
        <FormattedMessage {...(onEntry ? adminMessages.confirmPhoto : m.confirmShared)} />
      </p>
      <fieldset className="hide-reasons">
        <legend className="field-label">
          <FormattedMessage {...adminMessages.why} />
        </legend>
        {HIDE_REASONS.map((r) => (
          <label key={r} className="hide-reason">
            <input type="radio" className="hide-reason-radio" name={name} checked={reason === r} onChange={() => setReason(r)} />
            <FormattedMessage {...adminMessages[r]} />
          </label>
        ))}
      </fieldset>
      <label htmlFor={noteId} className="field-label">
        <FormattedMessage {...(noteRequired ? adminMessages.noteRequired : adminMessages.notePlain)} />
      </label>
      <input
        id={noteId}
        className="field-input"
        value={note}
        maxLength={HIDE_NOTE_MAX_LENGTH}
        required={noteRequired}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="admin-buttons">
        <button
          type="button"
          className="admin-confirm-button"
          disabled={busy || !ready}
          onClick={() => onHide(reason!, note.trim() || null)}
        >
          <FormattedMessage {...adminMessages.yesPhoto} />
        </button>
        <button type="button" className="admin-button" disabled={busy} onClick={onCancel}>
          <FormattedMessage {...adminMessages.cancel} />
        </button>
      </div>
    </>
  );
}
