import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type PhotosPage as PhotosPageData } from '../king/api';
import type { AdminSession } from '../king/admin';
import type { PhotoFiles, PhotoResizer } from '../king/photo';
import { event, fakeAdminApi, fakeApi, fakeOwnUndo, photo, SIGN_IN } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';
import { PhotosPage } from './PhotosPage';

const KEY = 'device-key';
const RESIZED: PhotoFiles = { photo: new Blob(['full']), thumbnail: new Blob(['thumb']) };
const day = (d: number) => new Date(`2026-10-0${d}T10:00:00`).toISOString();

const shared = photo({ id: 'p-shared', postedAt: day(8), reporterName: 'Kael' });
const onSighting = photo({
  id: 'p-seen',
  postedAt: day(7),
  reporterName: 'Sarah',
  event: event({ id: 'e1', kind: 'seen', occurredAt: day(7), reporterName: 'Sarah', photoId: 'p-seen' }),
});

type Options = {
  page?: PhotosPageData;
  api?: ReturnType<typeof fakeApi>;
  nickname?: string | null;
  postingAllowed?: boolean;
  resize?: PhotoResizer;
  admin?: AdminSession;
  own?: ReturnType<typeof fakeOwnUndo>;
};

const renderPage = ({
  page = { photos: [shared, onSighting], next: null },
  api = fakeApi(undefined, { photos: page }),
  nickname = 'Sunny',
  postingAllowed = true,
  resize = vi.fn(async () => RESIZED),
  admin,
  own,
}: Options = {}) => {
  const onPostingRefused = vi.fn();
  const onPhotosChanged = vi.fn();
  renderInEnglish(
    <PhotosPage
      api={api}
      spots={[]}
      reporterKey={KEY}
      nickname={nickname}
      postingAllowed={postingAllowed}
      onPostingRefused={onPostingRefused}
      onPhotosChanged={onPhotosChanged}
      resize={resize}
      admin={admin}
      own={own}
    />,
  );
  return { api, onPostingRefused, onPhotosChanged };
};

const grid = () => within(screen.getByRole('list', { name: 'Photos of King' }));
// Waits for the photos to load.
const shown = async (role: 'link' | 'listitem') => within(await screen.findByRole('list', { name: 'Photos of King' })).getAllByRole(role);
const share = () => screen.getByLabelText('Share a photo');
const pick = () => userEvent.upload(share(), new File(['camera'], 'IMG_2.jpg', { type: 'image/jpeg' }));

describe('PhotosPage', () => {
  it('opens on its heading and shows every photo newest first, each opening the full size, described by how it was added', async () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Photos of King' })).toHaveFocus();
    const links = await shown('link');
    expect(links.map((l) => within(l).getByRole('img').getAttribute('alt'))).toEqual([
      'Photo shared by Kael on Oct 8, 2026',
      'Photo from a sighting by Sarah, Oct 7, 2026, 10:00 AM',
    ]);
    expect(links[0]).toHaveAttribute('href', '/api/king/photos/p-shared/full');
    expect(within(links[0]).getByRole('img')).toHaveAttribute('src', '/api/king/photos/p-shared/thumb');
    // Alt text is never shown on hover; the title is, on devices that hover.
    expect(links.map((l) => within(l).getByRole('img').getAttribute('title'))).toEqual([
      'Photo shared by Kael on Oct 8, 2026',
      'Photo from a sighting by Sarah, Oct 7, 2026, 10:00 AM',
    ]);
  });

  it('says so when there are no photos yet', async () => {
    renderPage({ page: { photos: [], next: null } });

    expect(await screen.findByText('No photos yet.')).toBeInTheDocument();
  });

  it('says so when the photos can’t be loaded, and can try again', async () => {
    const api = fakeApi();
    api.getPhotos.mockRejectedValueOnce(new ApiError(503));
    renderPage({ api });

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the photos.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(api.getPhotos).toHaveBeenCalledTimes(2);
  });

  it('“Show older” loads the next 50 and moves focus to the first older photo', async () => {
    const older = photo({ id: 'p-old', postedAt: day(2), reporterName: 'Mo' });
    const oldest = photo({ id: 'p-oldest', postedAt: day(1), reporterName: 'Mo' });
    const api = fakeApi();
    api.getPhotos.mockImplementation(async (before) =>
      before === undefined ? { photos: [shared], next: 'p-shared' } : { photos: [older, oldest], next: null },
    );
    renderPage({ api });

    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));

    expect(api.getPhotos).toHaveBeenLastCalledWith('p-shared');
    const older2 = await grid().findByRole('link', { name: 'Photo shared by Mo on Oct 2, 2026' });
    expect(older2).toHaveFocus();
    expect(grid().getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument();
  });

  it('says so when older photos can’t be loaded, and still offers Show older', async () => {
    const api = fakeApi();
    api.getPhotos.mockImplementation(async (before) => {
      if (before === undefined) return { photos: [shared], next: 'p-shared' };
      throw new ApiError(503);
    });
    renderPage({ api });

    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load older photos.');
    expect(screen.getByRole('button', { name: 'Show older' })).toBeEnabled();
  });

  it('says a shared photo isn’t a sighting', () => {
    renderPage();

    expect(screen.getByText('A shared photo isn’t logged as a sighting, so it can be from any day.')).toBeInTheDocument();
  });
});

describe('PhotosPage — the viewer', () => {
  const older = photo({ id: 'p-old', postedAt: day(1), reporterName: 'Mo' });
  const dialog = () => screen.findByRole('dialog');
  const picture = (d: HTMLElement) => within(d).getByRole('img');
  const goBack = () =>
    act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
  const openFirst = async (options: Options = {}) => {
    const rendered = renderPage(options);
    const link = (await shown('link'))[0];
    const notPrevented = fireEvent.click(link);
    return { ...rendered, link, notPrevented };
  };

  it('a tap on a thumbnail opens the viewer on that photo, at its own address, instead of the bare file', async () => {
    const { notPrevented, api } = await openFirst();

    const d = await dialog();
    expect(notPrevented).toBe(false);
    expect(picture(d)).toHaveAttribute('src', '/api/king/photos/p-shared/full');
    expect(within(d).getByText('1 of 2')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/photos/p-shared');
    expect(api.getPhoto).not.toHaveBeenCalled();

    // No older page to load: the end is the end.
    fireEvent.keyDown(d, { key: 'ArrowRight' });
    expect(within(d).getByText('2 of 2')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Next photo' })).toBeDisabled();
  });

  it('a modified click or another button keeps the link to the file (a new tab)', async () => {
    renderPage();
    const link = (await shown('link'))[0];

    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(fireEvent.click(link, { button: 1 })).toBe(true);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('moving replaces the address, so Back closes the viewer instead of stepping through every photo', async () => {
    await openFirst();
    const d = await dialog();
    const entries = window.history.length;

    fireEvent.keyDown(d, { key: 'ArrowRight' });

    expect(picture(d)).toHaveAttribute('src', '/api/king/photos/p-seen/full');
    expect(window.location.pathname).toBe('/photos/p-seen');
    expect(window.history.length).toBe(entries);

    await goBack();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('Escape closes it, takes the address back and returns focus to the thumbnail', async () => {
    const { link } = await openFirst();
    const d = await dialog();
    const back = vi.spyOn(window.history, 'back');

    // A browser's Escape reaches the viewer's keydown and the dialog's cancel: one step back, not two.
    fireEvent.keyDown(d, { key: 'Escape' });
    fireEvent(d, new Event('cancel', { cancelable: true }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/');
    expect(link).toHaveFocus();
    back.mockRestore();

    // Opened by its address afterwards, closing replaces the address rather than stepping back.
    window.history.replaceState(null, '', '/photos/p-seen');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    fireEvent.keyDown(await dialog(), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.location.pathname).toBe('/photos');
  });

  it('opened by its address, a photo among the loaded ones shows in its place', async () => {
    window.history.replaceState(null, '', '/photos/p-seen');
    renderPage();

    const d = await dialog();

    expect(picture(d)).toHaveAttribute('src', '/api/king/photos/p-seen/full');
    expect(within(d).getByText('2 of 2')).toBeInTheDocument();
    expect(fakeApi().getPhoto).not.toHaveBeenCalled();
  });

  it('opened by its address, a photo older than the loaded ones is fetched and shown alone', async () => {
    window.history.replaceState(null, '', '/photos/p-old');
    const api = fakeApi(undefined, { photos: { photos: [shared, onSighting], next: 'p-seen' } });
    api.getPhoto.mockResolvedValue(older);
    renderPage({ api });

    const d = await dialog();

    expect(api.getPhoto).toHaveBeenCalledTimes(1);
    expect(api.getPhoto).toHaveBeenCalledWith('p-old');
    expect(picture(d)).toHaveAttribute('src', '/api/king/photos/p-old/full');
    expect(within(d).getByText('1 of 1')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Previous photo' })).toBeDisabled();
    expect(within(d).getByRole('button', { name: 'Next photo' })).toBeDisabled();

    fireEvent.keyDown(d, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.location.pathname).toBe('/photos');
  });

  it('a link to a photo that is hidden or gone says so above the grid', async () => {
    window.history.replaceState(null, '', '/photos/p-gone');
    const api = fakeApi(undefined, { photos: { photos: [shared], next: null } });
    api.getPhoto.mockRejectedValue(new ApiError(404));
    renderPage({ api });

    const notice = await screen.findByText('That photo isn’t here any more.');

    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/photos');
  });

  it('Next past the last loaded photo fetches the older page and moves on to it', async () => {
    const api = fakeApi();
    api.getPhotos.mockImplementation(async (before) =>
      before === undefined ? { photos: [shared], next: 'p-shared' } : { photos: [older], next: null },
    );
    await openFirst({ api });
    const d = await dialog();

    await userEvent.click(within(d).getByRole('button', { name: 'Next photo' }));

    expect(api.getPhotos).toHaveBeenLastCalledWith('p-shared');
    await waitFor(() => expect(picture(d)).toHaveAttribute('src', '/api/king/photos/p-old/full'));
    expect(within(d).getByText('2 of 2')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/photos/p-old');
    // The new thumbnail behind the viewer doesn't take the focus (the grid is inert under a modal dialog).
    expect(grid().getByRole('link', { name: 'Photo shared by Mo on Oct 1, 2026' })).not.toHaveFocus();
  });

  it('when the older page fails, the page says so and the viewer stays on the last photo, Next ready to try again', async () => {
    const api = fakeApi();
    api.getPhotos.mockImplementation(async (before) => {
      if (before === undefined) return { photos: [shared], next: 'p-shared' };
      throw new ApiError(503);
    });
    await openFirst({ api });
    const d = await dialog();

    await userEvent.click(within(d).getByRole('button', { name: 'Next photo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load older photos.');
    expect(picture(d)).toHaveAttribute('src', '/api/king/photos/p-shared/full');
    expect(within(d).getByText('1 of 1')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Next photo' })).toBeEnabled();
  });
});

describe('PhotosPage — sharing a photo', () => {
  it('shrinks the photo, shares it under this device’s name and shows it first', async () => {
    const { api } = renderPage();
    await shown('link');

    await pick();

    await waitFor(() => expect(api.sharePhoto).toHaveBeenCalledWith({ reporterKey: KEY, reporterName: 'Sunny' }, RESIZED));
    expect(await screen.findByText('Photo shared. Thank you!')).toHaveFocus();
    expect(grid().getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/api/king/photos/shared-photo/full',
      '/api/king/photos/p-shared/full',
      '/api/king/photos/p-seen/full',
    ]);
  });

  it('shares without a name when this device has none', async () => {
    const { api } = renderPage({ nickname: null });

    await pick();

    await waitFor(() => expect(api.sharePhoto).toHaveBeenCalledWith({ reporterKey: KEY }, RESIZED));
  });

  it('says so when sharing fails, and Retry sends the same photo again', async () => {
    const api = fakeApi(undefined, { photos: { photos: [], next: null } });
    api.sharePhoto.mockRejectedValueOnce(new ApiError(503));
    renderPage({ api });

    await pick();

    expect(await screen.findByRole('alert')).toHaveTextContent('Your photo couldn’t be shared.');
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(api.sharePhoto).toHaveBeenCalledTimes(2);
    expect(api.sharePhoto).toHaveBeenLastCalledWith({ reporterKey: KEY, reporterName: 'Sunny' }, RESIZED);
    expect(await screen.findByText('Photo shared. Thank you!')).toBeInTheDocument();
  });

  it('says so when the browser can’t use the photo', async () => {
    const { api } = renderPage({ resize: async () => Promise.reject(new Error('cannot decode')) });

    await pick();

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t use that photo. Try another one.');
    expect(api.sharePhoto).not.toHaveBeenCalled();
    expect(share()).toBeInTheDocument();
  });

  it('shows “Sharing your photo…” while it goes, with no second pick', async () => {
    let finish!: () => void;
    const api = fakeApi();
    api.sharePhoto.mockReturnValue(new Promise((resolve) => (finish = () => resolve(photo({ id: 'shared-photo' })))));
    renderPage({ api });

    await pick();

    expect(await screen.findByRole('status')).toHaveTextContent('Sharing your photo…');
    expect(screen.queryByLabelText('Share a photo')).not.toBeInTheDocument();
    finish();
    expect(await screen.findByText('Photo shared. Thank you!')).toBeInTheDocument();
    expect(share()).toBeInTheDocument();
  });

  it('keeps sharing open after an ordinary failure: only a refusal from outside the US closes it', async () => {
    const api = fakeApi();
    api.sharePhoto.mockRejectedValue(new ApiError(503));
    const { onPostingRefused } = renderPage({ api });

    await pick();

    expect(await screen.findByRole('alert')).toHaveTextContent('Your photo couldn’t be shared.');
    expect(onPostingRefused).not.toHaveBeenCalled();
  });

  it('offers no sharing to a visitor outside the US', () => {
    renderPage({ postingAllowed: false });

    expect(screen.queryByLabelText('Share a photo')).not.toBeInTheDocument();
  });

  it('tells the app when a share is refused from outside the US', async () => {
    const api = fakeApi();
    api.sharePhoto.mockRejectedValue(new ApiError(403));
    const { onPostingRefused } = renderPage({ api });

    await pick();

    await waitFor(() => expect(onPostingRefused).toHaveBeenCalled());
  });
});

describe('PhotosPage — admin', () => {
  const session = (api = fakeAdminApi()) => ({ signIn: SIGN_IN, api, onRejected: vi.fn() });

  it('keeps focus on the page heading for an admin, not on a photo’s hide button', async () => {
    renderPage({ admin: session() });

    await shown('listitem');

    expect(screen.getByRole('heading', { level: 1, name: 'Photos of King' })).toHaveFocus();
  });

  it('offers no hide button to visitors', async () => {
    renderPage();
    await shown('link');

    expect(screen.queryByRole('button', { name: 'Hide this photo' })).not.toBeInTheDocument();
  });

  it('hides a photo after asking in place, takes it off the page and says where to restore it', async () => {
    const adminApi = fakeAdminApi();
    renderPage({ admin: session(adminApi) });
    const [first] = await shown('listitem');

    await userEvent.click(within(first).getByRole('button', { name: 'Hide this photo' }));
    expect(within(first).getByText('Hide this photo from everyone?')).toHaveFocus();
    await userEvent.click(within(first).getByRole('radio', { name: 'Other' }));
    await userEvent.type(within(first).getByRole('textbox', { name: 'Note (required for Other)' }), 'a thumb over the lens');
    await userEvent.click(within(first).getByRole('button', { name: 'Hide photo' }));

    expect(adminApi.hidePhoto).toHaveBeenCalledWith(SIGN_IN, 'p-shared', 'other', 'a thumb over the lens');
    expect(await screen.findByRole('status')).toHaveTextContent('Hidden. You can restore it on the admin page.');
    expect(screen.getByRole('status')).toHaveFocus();
    expect(grid().getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/api/king/photos/p-seen/full']);
  });

  it('says the entry stays when hiding a photo on an entry', async () => {
    renderPage({ admin: session() });
    const items = await shown('listitem');

    await userEvent.click(within(items[1]).getByRole('button', { name: 'Hide this photo' }));

    expect(within(items[1]).getByText('Hide this photo from everyone? The entry stays.')).toBeInTheDocument();
  });

  it('Cancel puts focus back on “Hide this photo” and hides nothing', async () => {
    const adminApi = fakeAdminApi();
    renderPage({ admin: session(adminApi) });
    const [first] = await shown('listitem');

    await userEvent.click(within(first).getByRole('button', { name: 'Hide this photo' }));
    await userEvent.click(within(first).getByRole('button', { name: 'Cancel' }));

    expect(within(first).getByRole('button', { name: 'Hide this photo' })).toHaveFocus();
    expect(adminApi.hidePhoto).not.toHaveBeenCalled();
  });

  it('says so when hiding fails, and signs out on a rejected key', async () => {
    const adminApi = fakeAdminApi();
    adminApi.hidePhoto.mockRejectedValueOnce(new ApiError(503)).mockRejectedValueOnce(new ApiError(401));
    const admin = session(adminApi);
    renderPage({ admin });
    const [first] = await shown('listitem');

    await userEvent.click(within(first).getByRole('button', { name: 'Hide this photo' }));
    await userEvent.click(within(first).getByRole('radio', { name: 'Rude or off-topic' }));
    await userEvent.click(within(first).getByRole('button', { name: 'Hide photo' }));
    expect(await within(first).findByRole('alert')).toHaveTextContent('Couldn’t hide it. Try again.');

    await userEvent.click(within(first).getByRole('button', { name: 'Hide this photo' }));
    await userEvent.click(within(first).getByRole('radio', { name: 'Rude or off-topic' }));
    await userEvent.click(within(first).getByRole('button', { name: 'Hide photo' }));
    await waitFor(() => expect(admin.onRejected).toHaveBeenCalled());
  });
});

describe('PhotosPage — removing one’s own photo', () => {
  it('remembers a photo this device shares, with the server’s time for it', async () => {
    const own = fakeOwnUndo();
    renderPage({ own });
    await shown('link');

    await pick();

    await waitFor(() => expect(own.remember).toHaveBeenCalledWith('shared-photo', expect.any(String)));
  });

  it('offers Remove only on a photo this device shared in the last 10 minutes', async () => {
    renderPage({ own: fakeOwnUndo(['p-shared']) });

    const [mine, onSighting] = (await shown('listitem')).map((li) => within(li));
    expect(mine.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(onSighting.queryByRole('button')).not.toBeInTheDocument();
  });

  it('removes it after asking, then says so and lets Home load again', async () => {
    const own = fakeOwnUndo(['p-shared']);
    const { onPhotosChanged } = renderPage({ own });
    const [mine] = await shown('listitem');
    expect(screen.queryByText('Your photo was removed.')).not.toBeInTheDocument();

    await userEvent.click(within(mine).getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove this photo?')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }));

    expect(own.removePhoto).toHaveBeenCalledWith('p-shared');
    expect(grid().getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/api/king/photos/p-seen/full']);
    expect(onPhotosChanged).toHaveBeenCalledOnce();
    expect(screen.getByText('Your photo was removed.')).toHaveFocus();
  });
});
