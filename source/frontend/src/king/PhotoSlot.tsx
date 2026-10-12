import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import { CameraIcon } from './icons';
import type { PhotoFiles } from './photo';

type Values = {
  add: NoMessageValues;
  reading: NoMessageValues;
  pickedAlt: NoMessageValues;
  remove: NoMessageValues;
  unreadable: NoMessageValues;
  sending: NoMessageValues;
  added: NoMessageValues;
  addedAlt: NoMessageValues;
  failedSighting: NoMessageValues;
  failedFeeding: NoMessageValues;
  retry: NoMessageValues;
  tooLate: NoMessageValues;
};

const m = defineMessages<Values>({
  add: { id: 'photo.add', defaultMessage: 'Add a photo', description: 'Picks a photo of King (camera or library) to add to the entry' },
  reading: { id: 'photo.reading', defaultMessage: 'Getting your photo ready…', description: 'Shown while the picked photo is shrunk' },
  pickedAlt: { id: 'photo.pickedAlt', defaultMessage: 'The photo you picked', description: 'Alt text of the picked photo, before logging' },
  remove: { id: 'photo.remove', defaultMessage: 'Remove photo', description: 'Takes the picked photo back before logging' },
  unreadable: {
    id: 'photo.unreadable',
    defaultMessage: 'Couldn’t use that photo. Try another one.',
    description: 'The browser could not read or shrink the picked file',
  },
  sending: { id: 'photo.sending', defaultMessage: 'Adding your photo…', description: 'Shown while the photo uploads' },
  added: { id: 'photo.added', defaultMessage: 'Photo added', description: 'The photo was added to the entry just logged' },
  addedAlt: { id: 'photo.addedAlt', defaultMessage: 'The photo you added', description: 'Alt text of the photo just added' },
  failedSighting: {
    id: 'photo.failedSighting',
    defaultMessage: 'Your photo couldn’t be added. Your sighting is saved.',
    description: 'The upload failed after the sighting was logged; Retry follows',
  },
  failedFeeding: {
    id: 'photo.failedFeeding',
    defaultMessage: 'Your photo couldn’t be added. Your feeding is saved.',
    description: 'The upload failed after the feeding was logged; Retry follows',
  },
  retry: { id: 'photo.retry', defaultMessage: 'Retry', description: 'Sends the same photo again' },
  tooLate: {
    id: 'photo.tooLate',
    defaultMessage: 'It’s too late to add a photo — photos can only be added for 10 minutes.',
    description: 'The server refused the photo because the entry is older than 10 minutes',
  },
});

/** The photo going with an entry: none (null), being shrunk, ready, or on its way. */
export type PhotoState =
  | { status: 'reading' | 'unreadable' | 'tooLate' }
  | { status: 'picked' | 'sending' | 'added' | 'failed'; files: PhotoFiles };

// A fresh object URL per element (React 19 ref cleanup), so StrictMode's second mount never gets a revoked one.
function PhotoPreview({ blob, alt }: { blob: Blob; alt: string }) {
  const show = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const url = URL.createObjectURL(blob);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [blob],
  );
  return <img ref={show} alt={alt} className="photo-preview" />;
}

// A real file input (keyboard, camera or library on phones) drawn as a button; picking the same file twice still fires.
type PickerProps = { unreadable: boolean; input: RefObject<HTMLInputElement | null>; onPick: (file: File) => void };

function PhotoPicker({ unreadable, input, onPick }: PickerProps) {
  return (
    <>
      {unreadable && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.unreadable} />
        </div>
      )}
      <label className="photo-pick">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="photo-pick-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPick(file);
          }}
        />
        <CameraIcon className="button-icon" />
        <FormattedMessage {...m.add} />
      </label>
    </>
  );
}

// Moves focus to whatever replaced the control the person just used, but only after they used one here.
// `target` must be stable (it reads refs), so only a change of state moves focus.
function useFocusAfterAction(status: string | undefined, target: () => HTMLElement | null) {
  const acted = useRef(false);
  useEffect(() => {
    if (acted.current) target()?.focus();
  }, [status, target]);
  return () => {
    acted.current = true;
  };
}

type DraftProps = { photo: PhotoState | null; onPick: (file: File) => void; onRemove: () => void };

/** Before logging (Seen and Feed screens): pick, see and take back the photo. */
export function DraftPhoto({ photo, onPick, onRemove }: DraftProps) {
  const intl = useIntl();
  const input = useRef<HTMLInputElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  const act = useFocusAfterAction(photo?.status, useCallback(() => remove.current ?? input.current, []));

  if (photo?.status === 'reading') {
    return (
      <p role="status" className="photo-status">
        <FormattedMessage {...m.reading} />
      </p>
    );
  }
  if (photo?.status === 'picked') {
    return (
      <div className="photo-picked">
        <PhotoPreview blob={photo.files.thumbnail} alt={intl.formatMessage(m.pickedAlt)} />
        <button
          ref={remove}
          type="button"
          className="text-button"
          onClick={() => {
            act();
            onRemove();
          }}
        >
          <FormattedMessage {...m.remove} />
        </button>
      </div>
    );
  }
  return (
    <PhotoPicker
      unreadable={photo?.status === 'unreadable'}
      input={input}
      onPick={(file) => {
        act();
        onPick(file);
      }}
    />
  );
}

type LoggedProps = {
  photo: PhotoState | null;
  kind: 'fed' | 'seen';
  onPick: (file: File) => void;
  onRetry: () => void;
};

/** On the confirmation: the photo on its way, added, failed with Retry — or "Add a photo" when there's none yet. */
export function LoggedPhoto({ photo, kind, onPick, onRetry }: LoggedProps) {
  const intl = useIntl();
  const input = useRef<HTMLInputElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const added = useRef<HTMLParagraphElement>(null);
  const act = useFocusAfterAction(
    photo?.status,
    useCallback(() => added.current ?? retry.current ?? input.current, []),
  );

  switch (photo?.status) {
    case 'reading':
    case 'sending':
      return (
        <p role="status" className="photo-status">
          <FormattedMessage {...m.sending} />
        </p>
      );
    case 'added':
      return (
        <div className="photo-picked">
          <PhotoPreview blob={photo.files.thumbnail} alt={intl.formatMessage(m.addedAlt)} />
          <p ref={added} tabIndex={-1} role="status" className="photo-status">
            <FormattedMessage {...m.added} />
          </p>
        </div>
      );
    case 'failed':
      return (
        <>
          <div role="alert" className="alert alert-error">
            <FormattedMessage {...(kind === 'fed' ? m.failedFeeding : m.failedSighting)} />
          </div>
          <button
            ref={retry}
            type="button"
            className="photo-retry"
            onClick={() => {
              act();
              onRetry();
            }}
          >
            <FormattedMessage {...m.retry} />
          </button>
        </>
      );
    case 'tooLate':
      return (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.tooLate} />
        </div>
      );
  }
  return (
    <PhotoPicker
      unreadable={photo?.status === 'unreadable'}
      input={input}
      onPick={(file) => {
        act();
        onPick(file);
      }}
    />
  );
}
