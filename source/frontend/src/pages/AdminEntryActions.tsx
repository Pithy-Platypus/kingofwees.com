import { useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import { isKeyRejected, type AdminSession, type DeviceView } from '../king/admin';
import type { KingEventView } from '../king/api';
import { common } from '../king/messages';

type Values = {
  hideEntry: NoMessageValues;
  hideDevice: NoMessageValues;
  confirmEntry: NoMessageValues;
  confirmDevice: { entries: number; spots: number; name: string };
  yesEntry: NoMessageValues;
  yesDevice: NoMessageValues;
  cancel: NoMessageValues;
  counting: NoMessageValues;
  failed: NoMessageValues;
};

const m = defineMessages<Values>({
  hideEntry: { id: 'admin.hideEntry', defaultMessage: 'Hide this entry', description: 'Admin button under an entry: hides it from everyone' },
  hideDevice: {
    id: 'admin.hideDevice',
    defaultMessage: 'Hide everything from this poster',
    description: 'Admin button under an entry: hides every entry and spot from the device that posted it',
  },
  confirmEntry: {
    id: 'admin.confirmEntry',
    defaultMessage: 'Hide this entry from everyone?',
    description: 'Asked before hiding one entry',
  },
  confirmDevice: {
    id: 'admin.confirmDevice',
    defaultMessage:
      'Hide {entries, plural, one {# entry} other {# entries}} and {spots, plural, =0 {no spots} one {# spot} other {# spots}} from {name}, including anything they post later?',
    description: 'Asked before hiding a poster; {name} is the name on their newest entry, or “a neighbor”',
  },
  yesEntry: { id: 'admin.yesEntry', defaultMessage: 'Hide it', description: 'Confirms hiding one entry' },
  yesDevice: { id: 'admin.yesDevice', defaultMessage: 'Hide all', description: 'Confirms hiding everything from a poster' },
  cancel: { id: 'admin.cancel', defaultMessage: 'Cancel', description: 'Closes the hide question without hiding' },
  counting: { id: 'admin.counting', defaultMessage: 'Counting…', description: 'Shown while counting what hiding a poster would hide' },
  failed: { id: 'admin.hideFailed', defaultMessage: 'Couldn’t hide it. Try again.', description: 'Shown when hiding fails' },
});

type Step = { name: 'idle' } | { name: 'entry' } | { name: 'counting' } | { name: 'device'; device: DeviceView };

type Props = { event: KingEventView; admin: AdminSession; onHidden: () => void };

/** Hide one entry, or everything from its poster — always asked in place first, never with a browser dialog. */
export function AdminEntryActions({ event, admin, onHidden }: Props) {
  const intl = useIntl();
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [returnTo, setReturnTo] = useState<'entry' | 'device' | null>(null);
  const question = useRef<HTMLParagraphElement>(null);
  const entryButton = useRef<HTMLButtonElement>(null);
  const deviceButton = useRef<HTMLButtonElement>(null);

  // The question takes focus so it is read out; Cancel puts focus back on the button that asked it.
  useEffect(() => {
    if (step.name === 'entry' || step.name === 'device') question.current?.focus();
    else if (step.name === 'idle' && returnTo) (returnTo === 'entry' ? entryButton : deviceButton).current?.focus();
  }, [step, returnTo]);

  const fail = (error: unknown) => {
    if (isKeyRejected(error)) {
      admin.onRejected();
      return;
    }
    setFailed(true);
    setStep({ name: 'idle' });
  };

  const askDevice = async () => {
    setFailed(false);
    setStep({ name: 'counting' });
    try {
      setStep({ name: 'device', device: await admin.api.describeDevice(admin.key, event.id) });
    } catch (error) {
      fail(error);
    }
  };

  const hide = async () => {
    setBusy(true);
    try {
      if (step.name === 'device') await admin.api.hideDevice(admin.key, event.id);
      else await admin.api.hideEntry(admin.key, event.id);
      onHidden();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setReturnTo(step.name === 'device' ? 'device' : 'entry');
    setStep({ name: 'idle' });
  };

  if (step.name === 'counting') {
    return (
      <p role="status">
        <FormattedMessage {...m.counting} />
      </p>
    );
  }

  if (step.name === 'entry' || step.name === 'device') {
    return (
      <>
        <p ref={question} tabIndex={-1} className="admin-question">
          {step.name === 'entry' ? (
            <FormattedMessage {...m.confirmEntry} />
          ) : (
            <FormattedMessage
              {...m.confirmDevice}
              values={{
                entries: step.device.entries,
                spots: step.device.spots,
                name: step.device.reporterName ?? intl.formatMessage(common.aNeighbor),
              }}
            />
          )}
        </p>
        <div className="admin-buttons">
          <button type="button" className="admin-confirm-button" disabled={busy} onClick={() => void hide()}>
            <FormattedMessage {...(step.name === 'entry' ? m.yesEntry : m.yesDevice)} />
          </button>
          <button type="button" className="admin-button" disabled={busy} onClick={cancel}>
            <FormattedMessage {...m.cancel} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {failed && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.failed} />
        </div>
      )}
      <div className="admin-buttons">
        <button
          ref={entryButton}
          type="button"
          className="admin-button"
          onClick={() => {
            setFailed(false);
            setStep({ name: 'entry' });
          }}
        >
          <FormattedMessage {...m.hideEntry} />
        </button>
        <button ref={deviceButton} type="button" className="admin-button" onClick={() => void askDevice()}>
          <FormattedMessage {...m.hideDevice} />
        </button>
      </div>
    </>
  );
}
