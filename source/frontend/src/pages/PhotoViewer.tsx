import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { photoUrl, type PhotoView, type SpotView } from '../king/api';
import { photoAlt } from '../king/messages';
import { viewerMessages } from './viewerMessages';

// One photo at a time over the grid, with Previous and Next: a tapped photo used to open as the bare JPEG, and seeing
// the next one meant Back and another tap (Wallie, 2026-10-25). A native <dialog>: the browser traps focus and
// returns it. No wrap-around at the ends; past the last loaded photo the page is asked for the older ones.

/** A swipe: at least this far sideways, and more sideways than up or down. */
export const SWIPE_PX = 40;

type Props = {
  photos: PhotoView[];
  index: number;
  spots: SpotView[];
  /** The page has an older page it hasn't loaded. */
  hasOlder: boolean;
  loadingOlder: boolean;
  onIndex: (index: number) => void;
  onLoadOlder: () => void;
  onClose: () => void;
};

export function PhotoViewer({ photos, index, spots, hasOlder, loadingOlder, onIndex, onLoadOlder, onClose }: Props) {
  const intl = useIntl();
  const dialog = useRef<HTMLDialogElement>(null);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  // Next was pressed on the last photo: move on when the older ones arrive.
  const [waiting, setWaiting] = useState(false);
  const photo = photos[index];
  const atFirst = index === 0;
  const atLast = index === photos.length - 1;
  const description = photoAlt(intl, photo, spots);

  useEffect(() => dialog.current?.showModal(), []);

  // The neighbours are fetched now, so a swipe shows the next photo at once.
  useEffect(() => {
    for (const neighbour of [photos[index - 1], photos[index + 1]]) {
      if (neighbour) new Image().src = photoUrl(neighbour.id, 'full');
    }
  }, [photos, index]);

  useEffect(() => {
    if (waiting && index < photos.length - 1) {
      setWaiting(false);
      onIndex(index + 1);
    }
  }, [waiting, photos.length, index, onIndex]);

  // The older page didn't come (the page says so behind the viewer): Next can ask again.
  useEffect(() => {
    if (!loadingOlder) setWaiting(false);
  }, [loadingOlder]);

  const previous = () => {
    if (!atFirst) onIndex(index - 1);
  };
  const next = () => {
    if (!atLast) onIndex(index + 1);
    else if (hasOlder && !loadingOlder && !waiting) {
      setWaiting(true);
      onLoadOlder();
    }
  };

  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label={description}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') previous();
        else if (e.key === 'ArrowRight') next();
        else if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div
        className="photo-viewer-frame"
        data-testid="photo-viewer-frame"
        onPointerDown={(e) => {
          pressed.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          if (!pressed.current) return;
          const dx = e.clientX - pressed.current.x;
          const dy = e.clientY - pressed.current.y;
          pressed.current = null;
          if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) next();
            else previous();
          }
        }}
      >
        <img src={photoUrl(photo.id, 'full')} alt={description} className="photo-viewer-image" />
      </div>
      <div className="photo-viewer-bar">
        <p className="photo-viewer-caption">{description}</p>
        <p className="photo-viewer-position" aria-live="polite">
          {loadingOlder || waiting ? (
            <FormattedMessage {...viewerMessages.loadingOlder} />
          ) : (
            <FormattedMessage {...viewerMessages.position} values={{ n: index + 1, total: photos.length }} />
          )}
        </p>
        <div className="photo-viewer-controls">
          <button type="button" className="viewer-button" onClick={previous} disabled={atFirst} aria-label={intl.formatMessage(viewerMessages.previous)}>
            <span aria-hidden="true">‹</span>
          </button>
          <a href={photoUrl(photo.id, 'full')} className="viewer-open">
            <FormattedMessage {...viewerMessages.open} />
          </a>
          <button
            type="button"
            className="viewer-button"
            onClick={next}
            disabled={atLast && !hasOlder}
            aria-label={intl.formatMessage(viewerMessages.next)}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>
      <button type="button" className="viewer-close" onClick={onClose} aria-label={intl.formatMessage(viewerMessages.close)}>
        <span aria-hidden="true">×</span>
      </button>
    </dialog>
  );
}
