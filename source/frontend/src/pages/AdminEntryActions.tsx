import { useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import { isKeyRejected, type AdminSession, type DeviceView } from '../king/admin';
import type { KingEventView } from '../king/api';
import { common } from '../king/messages';
import { adminMessages } from './adminMessages';

type Values = {
  hideEntry: NoMessageValues;
  hideDevice: NoMessageValues;
  confirmEntry: NoMessageValues;
  confirmDevice: { entries: number; spots: number; name: string };
  yesEntry: NoMessageValues;
  yesDevice: NoMessageValues;
  counting: NoMessageValues;
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
  counting: { id: 'admin.counting', defaultMessage: 'Counting…', description: 'Shown while counting what hiding a poster would hide' },
});

type Step = { name: 'idle' } | { name: 'entry' } | { name: 'photo' } | { name: 'counting' } | { name: 'device'; device: DeviceView };
type Asked = 'entry' | 'photo' | 'device';

type Props = { event: KingEventView; admin: AdminSession; onHidden: () => void };

/** Hide one entry, its photo, or everything from its poster — always asked in place first, never with a browser dialog. */
export function AdminEntryActions({ event, admin, onHidden }: Props) {
  const intl = useIntl();
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [returnTo, setReturnTo] = useState<Asked | null>(null);
  const question = useRef<HTMLParagraphElement>(null);
  const entryButton = useRef<HTMLButtonElement>(null);
  const photoButton = useRef<HTMLButtonElement>(null);
  const deviceButton = useRef<HTMLButtonElement>(null);

  // The question takes focus so it is read out; Cancel puts focus back on the button that asked it.
  useEffect(() => {
    if (step.name === 'entry' || step.name === 'photo' || step.name === 'device') question.current?.focus();
    else if (step.name === 'idle' && returnTo) ({ entry: entryButton, photo: photoButton, device: deviceButton })[returnTo].current?.focus();
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
      setStep({ name: 'device', device: await admin.api.describeDevice(admin.signIn, event.id) });
    } catch (error) {
      fail(error);
    }
  };

  const hide = async () => {
    setBusy(true);
    try {
      if (step.name === 'device') await admin.api.hideDevice(admin.signIn, event.id);
      else if (step.name === 'photo' && event.photoId) await admin.api.hidePhoto(admin.signIn, event.photoId);
      else await admin.api.hideEntry(admin.signIn, event.id);
      onHidden();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setReturnTo(step.name === 'device' || step.name === 'photo' ? step.name : 'entry');
    setStep({ name: 'idle' });
  };

  if (step.name === 'counting') {
    return (
      <p role="status">
        <FormattedMessage {...m.counting} />
      </p>
    );
  }

  if (step.name === 'entry' || step.name === 'photo' || step.name === 'device') {
    return (
      <>
        <p ref={question} tabIndex={-1} className="admin-question">
          {step.name === 'entry' && <FormattedMessage {...m.confirmEntry} />}
          {step.name === 'photo' && <FormattedMessage {...adminMessages.confirmPhoto} />}
          {step.name === 'device' && (
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
            <FormattedMessage {...{ entry: m.yesEntry, photo: adminMessages.yesPhoto, device: m.yesDevice }[step.name]} />
          </button>
          <button type="button" className="admin-button" disabled={busy} onClick={cancel}>
            <FormattedMessage {...adminMessages.cancel} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {failed && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...adminMessages.failed} />
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
        {event.photoId && (
          <button
            ref={photoButton}
            type="button"
            className="admin-button"
            onClick={() => {
              setFailed(false);
              setStep({ name: 'photo' });
            }}
          >
            <FormattedMessage {...adminMessages.hidePhoto} />
          </button>
        )}
        <button ref={deviceButton} type="button" className="admin-button" onClick={() => void askDevice()}>
          <FormattedMessage {...m.hideDevice} />
        </button>
      </div>
    </>
  );
}
