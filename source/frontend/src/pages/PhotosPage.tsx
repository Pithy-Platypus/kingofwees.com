import { useEffect, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import { isKeyRejected, type AdminSession, type HideReason } from '../king/admin';
import { isPostingRefused, photoUrl, type kingApi, type PhotoView, type SpotView } from '../king/api';
import { photoAlt, photoPhrases } from '../king/messages';
import type { OwnUndo } from '../king/ownPosts';
import type { PhotoFiles, PhotoResizer } from '../king/photo';
import { PhotoPicker } from '../king/PhotoSlot';
import { ownMessages } from '../king/ownMessages';
import { UndoOwnPost } from '../king/UndoOwnPost';
import { Link } from '../routing/Link';
import { adminMessages } from './adminMessages';
import { HidePhotoForm } from './HidePhotoForm';
import { PageShell } from './PageShell';

type Values = {
  title: NoMessageValues;
  share: NoMessageValues;
  notASighting: NoMessageValues;
  sharing: NoMessageValues;
  shared: NoMessageValues;
  shareFailed: NoMessageValues;
  empty: NoMessageValues;
  loading: NoMessageValues;
  failed: NoMessageValues;
  olderFailed: NoMessageValues;
  tryAgain: NoMessageValues;
  showOlder: NoMessageValues;
};

const m = defineMessages<Values>({
  title: { id: 'photos.title', defaultMessage: 'Photos of King', description: 'Heading of the page with every photo of King' },
  share: { id: 'photos.share', defaultMessage: 'Share a photo', description: 'Picks a photo of King to share on its own, not with an entry' },
  notASighting: {
    id: 'photos.notASighting',
    defaultMessage: 'A shared photo isn’t logged as a sighting, so it can be from any day.',
    description: 'Under “Share a photo”: sharing a photo doesn’t say King was seen now',
  },
  sharing: { id: 'photos.sharing', defaultMessage: 'Sharing your photo…', description: 'Shown while a shared photo uploads' },
  shared: { id: 'photos.shared', defaultMessage: 'Photo shared. Thank you!', description: 'The shared photo was added to the page' },
  shareFailed: { id: 'photos.shareFailed', defaultMessage: 'Your photo couldn’t be shared.', description: 'Sharing failed; Retry follows' },
  empty: { id: 'photos.empty', defaultMessage: 'No photos yet.', description: 'The page has no photos at all' },
  loading: { id: 'photos.loading', defaultMessage: 'Loading photos…', description: 'Shown while the photos load' },
  failed: { id: 'photos.failed', defaultMessage: 'Couldn’t load the photos.', description: 'Shown when the photos cannot be loaded' },
  olderFailed: { id: 'photos.olderFailed', defaultMessage: 'Couldn’t load older photos.', description: 'Shown when Show older fails' },
  tryAgain: { id: 'photos.tryAgain', defaultMessage: 'Try again', description: 'Retry loading the photos' },
  showOlder: { id: 'photos.showOlder', defaultMessage: 'Show older', description: 'Loads the next, older photos' },
});

type Share = { status: 'reading' | 'unreadable' | 'shared' } | { status: 'sending' | 'failed'; files: PhotoFiles };

type HideProps = { photo: PhotoView; admin: AdminSession; onHidden: () => void };

// Like "Hide this photo" under a history entry: asked in place, Cancel back on the button, never deleted.
function HidePhoto({ photo, admin, onHidden }: HideProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cancelled, setCancelled] = useState(0);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (cancelled > 0) button.current?.focus();
  }, [cancelled]);

  const hide = async (reason: HideReason, note: string | null) => {
    setBusy(true);
    try {
      await admin.api.hidePhoto(admin.signIn, photo.id, reason, note);
      onHidden();
    } catch (error) {
      if (isKeyRejected(error)) admin.onRejected();
      else setFailed(true);
      setAsking(false);
    } finally {
      setBusy(false);
    }
  };

  if (asking) {
    return (
      <HidePhotoForm
        onEntry={photo.event !== null}
        busy={busy}
        onHide={(reason, note) => void hide(reason, note)}
        onCancel={() => {
          setAsking(false);
          setCancelled((n) => n + 1);
        }}
      />
    );
  }
  return (
    <>
      {failed && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...adminMessages.failed} />
        </div>
      )}
      <button
        ref={button}
        type="button"
        className="admin-button"
        onClick={() => {
          setFailed(false);
          setAsking(true);
        }}
      >
        <FormattedMessage {...adminMessages.hidePhoto} />
      </button>
    </>
  );
}

type Props = {
  api: Pick<typeof kingApi, 'getPhotos' | 'sharePhoto'>;
  spots: SpotView[];
  reporterKey: string;
  /** This device's name; null or empty shares as "a neighbor". */
  nickname: string | null;
  /** False for a visitor outside the US: no sharing. */
  postingAllowed: boolean;
  onPostingRefused: () => void;
  /** A photo was shared or hidden here: Home's newest photo may have changed. */
  onPhotosChanged: () => void;
  resize: PhotoResizer;
  /** Present when this device holds an accepted admin key: each photo gets "Hide this photo". */
  admin?: AdminSession;
  /** This device's own just-shared photos get Remove. */
  own?: OwnUndo;
};

/** Every visible photo, newest first, 50 at a time; shared photos are only ever here. */
export function PhotosPage({
  api,
  spots,
  reporterKey,
  nickname,
  postingAllowed,
  onPostingRefused,
  onPhotosChanged,
  resize,
  admin,
  own,
}: Props) {
  const intl = useIntl();
  const [photos, setPhotos] = useState<PhotoView[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [hidCount, setHidCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const removedNotice = useRef<HTMLParagraphElement>(null);
  const firstNew = useRef<HTMLAnchorElement>(null);
  const sharedNotice = useRef<HTMLParagraphElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const hiddenNotice = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setFailed(false);
    api.getPhotos().then(
      (page) => {
        setPhotos(page.photos);
        setNext(page.next);
      },
      () => setFailed(true),
    );
  }, [api, attempt]);

  useEffect(() => firstNew.current?.focus(), [focusId]);
  useEffect(() => {
    if (share?.status === 'shared') sharedNotice.current?.focus();
    if (share?.status === 'failed') retry.current?.focus();
  }, [share?.status]);
  useEffect(() => {
    if (hidCount > 0) hiddenNotice.current?.focus();
  }, [hidCount]);
  useEffect(() => {
    if (removedCount > 0) removedNotice.current?.focus();
  }, [removedCount]);

  const showOlder = async (before: string) => {
    setLoadingOlder(true);
    try {
      const page = await api.getPhotos(before);
      setPhotos((shown) => [...(shown ?? []), ...page.photos]);
      setNext(page.next);
      setOlderFailed(false);
      setFocusId(page.photos[0]?.id ?? null);
    } catch {
      setOlderFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (files: PhotoFiles) => {
    setShare({ status: 'sending', files });
    try {
      const added = await api.sharePhoto({ reporterKey, ...(nickname ? { reporterName: nickname } : {}) }, files);
      own?.remember(added.id, added.postedAt);
      setPhotos((shown) => [added, ...(shown ?? [])]);
      setShare({ status: 'shared' });
      onPhotosChanged();
    } catch (error) {
      if (isPostingRefused(error)) onPostingRefused();
      setShare({ status: 'failed', files });
    }
  };

  const pick = async (file: File) => {
    setShare({ status: 'reading' });
    let files: PhotoFiles;
    try {
      files = await resize(file);
    } catch {
      setShare({ status: 'unreadable' });
      return;
    }
    await send(files);
  };

  const hidden = (id: string) => {
    setPhotos((shown) => (shown ?? []).filter((p) => p.id !== id));
    setHidCount((n) => n + 1);
    onPhotosChanged();
  };

  const removed = (id: string) => {
    setPhotos((shown) => (shown ?? []).filter((p) => p.id !== id));
    setRemovedCount((n) => n + 1);
    onPhotosChanged();
  };

  let sharing;
  if (share?.status === 'reading' || share?.status === 'sending') {
    sharing = (
      <p role="status" className="photo-status">
        <FormattedMessage {...(share.status === 'reading' ? photoPhrases.reading : m.sharing)} />
      </p>
    );
  } else if (share?.status === 'failed') {
    const files = share.files;
    sharing = (
      <>
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.shareFailed} />
        </div>
        <button ref={retry} type="button" className="photo-retry" onClick={() => void send(files)}>
          <FormattedMessage {...photoPhrases.retry} />
        </button>
      </>
    );
  } else {
    sharing = (
      <>
        {share?.status === 'shared' && (
          <p ref={sharedNotice} tabIndex={-1} role="status" className="photo-status">
            <FormattedMessage {...m.shared} />
          </p>
        )}
        <PhotoPicker unreadable={share?.status === 'unreadable'} onPick={(file) => void pick(file)} label={<FormattedMessage {...m.share} />} />
      </>
    );
  }

  let body;
  if (failed) {
    body = (
      <>
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.failed} />
        </div>
        <button type="button" className="done-button" onClick={() => setAttempt((a) => a + 1)}>
          <FormattedMessage {...m.tryAgain} />
        </button>
      </>
    );
  } else if (!photos) {
    body = (
      <p role="status">
        <FormattedMessage {...m.loading} />
      </p>
    );
  } else if (photos.length === 0) {
    body = (
      <p className="activity-detail">
        <FormattedMessage {...m.empty} />
      </p>
    );
  } else {
    body = (
      <>
        <ul className="photo-grid" aria-labelledby="photos-title">
          {photos.map((p) => {
            // The title shows the description on hover; alt text never does.
            const description = photoAlt(intl, p, spots);
            return (
              <li key={p.id} className="photo-grid-item">
                <a ref={p.id === focusId ? firstNew : undefined} href={photoUrl(p.id, 'full')} className="photo-grid-link">
                  <img src={photoUrl(p.id, 'thumb')} alt={description} title={description} loading="lazy" className="photo-grid-image" />
                </a>
                {own?.canUndo(p.id) && <UndoOwnPost what="photo" onConfirm={() => own.removePhoto(p.id)} onDone={() => removed(p.id)} />}
                {admin && <HidePhoto photo={p} admin={admin} onHidden={() => hidden(p.id)} />}
              </li>
            );
          })}
        </ul>
        {olderFailed && (
          <div role="alert" className="alert alert-error">
            <FormattedMessage {...m.olderFailed} />
          </div>
        )}
        {next !== null && (
          <button type="button" className="done-button" disabled={loadingOlder} onClick={() => void showOlder(next)}>
            <FormattedMessage {...m.showOlder} />
          </button>
        )}
      </>
    );
  }

  return (
    <PageShell title={<FormattedMessage {...m.title} />} titleId="photos-title">
      {postingAllowed && (
        <div className="photo-share">
          {sharing}
          <p className="screen-hint">
            <FormattedMessage {...m.notASighting} />
          </p>
        </div>
      )}
      {removedCount > 0 && (
        <p ref={removedNotice} tabIndex={-1} role="status" className="screen-hint">
          <FormattedMessage {...ownMessages.undone} values={{ what: 'photo' }} />
        </p>
      )}
      {hidCount > 0 && (
        <p ref={hiddenNotice} tabIndex={-1} role="status" className="screen-hint">
          <FormattedMessage
            {...adminMessages.hidden}
            values={{
              admin: (chunks) => (
                <Link to="admin" className="text-link">
                  {chunks}
                </Link>
              ),
            }}
          />
        </p>
      )}
      {body}
    </PageShell>
  );
}
