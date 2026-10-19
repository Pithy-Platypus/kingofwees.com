import { useEffect, useRef, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { ApiError } from './api';
import { ownMessages, type What } from './ownMessages';

type Step = 'idle' | 'asking' | 'sending' | 'failed' | 'tooLate';
type Props = { what: What; onConfirm: () => Promise<void>; onDone: () => void };

/** Undo one's own entry, or remove one's own shared photo: asked in place first, never with a browser dialog. */
export function UndoOwnPost({ what, onConfirm, onDone }: Props) {
  const [step, setStep] = useState<Step>('idle');
  const [returning, setReturning] = useState(false);
  const question = useRef<HTMLParagraphElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // The question takes focus so it is read out; "Keep it" puts focus back on the button that asked it.
  useEffect(() => {
    if (step === 'asking') question.current?.focus();
    else if (step === 'idle' && returning) button.current?.focus();
  }, [step, returning]);

  const confirm = async () => {
    setStep('sending');
    try {
      await onConfirm();
    } catch (error) {
      setStep(error instanceof ApiError && error.status === 409 ? 'tooLate' : 'failed');
      return;
    }
    onDone();
  };

  if (step === 'tooLate') {
    return (
      <div role="alert" className="alert alert-warning">
        <FormattedMessage {...ownMessages.tooLate} values={{ what }} />
      </div>
    );
  }

  if (step === 'asking' || step === 'sending') {
    const sending = step === 'sending';
    return (
      <>
        <p ref={question} tabIndex={-1} className="own-question">
          <FormattedMessage {...ownMessages.confirm} values={{ what }} />
        </p>
        <div className="own-buttons">
          <button type="button" className="own-confirm-button" disabled={sending} onClick={() => void confirm()}>
            <FormattedMessage {...ownMessages.yes} values={{ what }} />
          </button>
          <button
            type="button"
            className="own-button"
            disabled={sending}
            onClick={() => {
              setReturning(true);
              setStep('idle');
            }}
          >
            <FormattedMessage {...ownMessages.keep} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {step === 'failed' && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...ownMessages.failed} values={{ what }} />
        </div>
      )}
      <div className="own-buttons">
        <button ref={button} type="button" className="own-button" onClick={() => setStep('asking')}>
          <FormattedMessage {...(what === 'photo' ? ownMessages.remove : ownMessages.undo)} />
        </button>
      </div>
    </>
  );
}
