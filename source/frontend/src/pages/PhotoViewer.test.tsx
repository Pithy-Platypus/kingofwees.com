import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { photo } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';
import { PhotoViewer, SWIPE_PX } from './PhotoViewer';

const day = (d: number) => new Date(`2026-10-0${d}T10:00:00`).toISOString();
const three = [
  photo({ id: 'p3', postedAt: day(8), reporterName: 'Kael' }),
  photo({ id: 'p2', postedAt: day(7), reporterName: 'Sarah' }),
  photo({ id: 'p1', postedAt: day(6), reporterName: null }),
];

type Options = { photos?: typeof three; index?: number; hasOlder?: boolean; loadingOlder?: boolean };

const renderViewer = ({ photos = three, index = 1, hasOlder = false, loadingOlder = false }: Options = {}) => {
  const onIndex = vi.fn();
  const onLoadOlder = vi.fn();
  const onClose = vi.fn();
  const view = renderInEnglish(
    <PhotoViewer
      photos={photos}
      index={index}
      spots={[]}
      hasOlder={hasOlder}
      loadingOlder={loadingOlder}
      onIndex={onIndex}
      onLoadOlder={onLoadOlder}
      onClose={onClose}
    />,
  );
  const again = (changes: Options) =>
    view.rerender(
      <PhotoViewer
        photos={changes.photos ?? photos}
        index={changes.index ?? index}
        spots={[]}
        hasOlder={changes.hasOlder ?? hasOlder}
        loadingOlder={changes.loadingOlder ?? loadingOlder}
        onIndex={onIndex}
        onLoadOlder={onLoadOlder}
        onClose={onClose}
      />,
    );
  return { onIndex, onLoadOlder, onClose, again };
};

const dialog = () => screen.getByRole('dialog');
const previous = () => screen.getByRole('button', { name: 'Previous photo' });
const next = () => screen.getByRole('button', { name: 'Next photo' });
const swipe = (dx: number, dy = 0) => {
  const frame = screen.getByTestId('photo-viewer-frame');
  fireEvent.pointerDown(frame, { clientX: 200, clientY: 300 });
  fireEvent.pointerUp(frame, { clientX: 200 + dx, clientY: 300 + dy });
};

describe('PhotoViewer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens on the given photo, full size, described and placed among the others', () => {
    renderViewer();

    expect(dialog()).toHaveAttribute('open');
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', '/api/king/photos/p2/full');
    expect(image.getAttribute('alt')).toContain('Sarah');
    expect(dialog()).toHaveAccessibleName(image.getAttribute('alt')!);
    expect(screen.getByText('2 of 3')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('link', { name: 'Open the picture' })).toHaveAttribute('href', '/api/king/photos/p2/full');
  });

  it('moves with the buttons and the arrow keys', async () => {
    const { onIndex } = renderViewer();

    await userEvent.click(next());
    await userEvent.click(previous());
    fireEvent.keyDown(dialog(), { key: 'ArrowLeft' });
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' });

    expect(onIndex.mock.calls).toEqual([[2], [0], [0], [2]]);
  });

  it('stops at the ends: no wrap-around', () => {
    const { onIndex, onLoadOlder, again } = renderViewer({ index: 0 });
    expect(previous()).toBeDisabled();
    fireEvent.keyDown(dialog(), { key: 'ArrowLeft' });

    again({ index: 2 });
    expect(next()).toBeDisabled();
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' });

    expect(onIndex).not.toHaveBeenCalled();
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it('on the last photo with older ones unloaded, Next asks for them once and moves on when they arrive', async () => {
    const { onIndex, onLoadOlder, again } = renderViewer({ index: 2, hasOlder: true });
    expect(next()).toBeEnabled();

    await userEvent.click(next());
    await userEvent.click(next());

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Loading older photos…')).toBeInTheDocument();
    expect(onIndex).not.toHaveBeenCalled();

    again({ photos: [...three, photo({ id: 'p0', postedAt: day(5) })], hasOlder: false });

    expect(onIndex).toHaveBeenCalledWith(3);
  });

  it('closes with the button, Escape, the dialog cancelling, and a tap beside the photo', async () => {
    const { onClose } = renderViewer();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    // Both are the viewer's to handle, so the browser's own closing is held back.
    expect(fireEvent.keyDown(dialog(), { key: 'Escape' })).toBe(false);
    expect(fireEvent(dialog(), new Event('cancel', { cancelable: true }))).toBe(false);
    fireEvent.click(dialog());
    fireEvent.keyDown(dialog(), { key: 'a' });

    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('a tap on the photo itself does not close it', () => {
    const { onClose } = renderViewer();

    fireEvent.click(screen.getByRole('img'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('a sideways swipe moves; a short, a vertical or a diagonal one does not', () => {
    const { onIndex } = renderViewer();

    swipe(-SWIPE_PX - 20);
    swipe(SWIPE_PX + 20);
    swipe(-SWIPE_PX); // exactly far enough
    swipe(-(SWIPE_PX - 20));
    swipe(-SWIPE_PX - 20, 200);
    swipe(-SWIPE_PX - 20, SWIPE_PX + 20); // as much up as sideways: not a swipe
    fireEvent.pointerUp(screen.getByTestId('photo-viewer-frame'), { clientX: 500, clientY: 300 }); // no press first

    expect(onIndex.mock.calls).toEqual([[2], [0], [2]]);
  });

  it('fetches the neighbours ahead of a swipe', () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(url: string) {
          fetched.push(url);
        }
      },
    );

    const { again } = renderViewer();
    expect(fetched).toEqual(['/api/king/photos/p3/full', '/api/king/photos/p1/full']);

    again({ index: 2 });

    expect(fetched).toEqual(['/api/king/photos/p3/full', '/api/king/photos/p1/full', '/api/king/photos/p2/full']);
  });
});
