import { screen, waitFor, within } from '@testing-library/react';
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
    const older = photo({ id: 'p-old', postedAt: day(1), reporterName: 'Mo' });
    const api = fakeApi();
    api.getPhotos.mockImplementation(async (before) =>
      before === undefined ? { photos: [shared], next: 'p-shared' } : { photos: [older], next: null },
    );
    renderPage({ api });

    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));

    expect(api.getPhotos).toHaveBeenLastCalledWith('p-shared');
    const older2 = await grid().findByRole('link', { name: 'Photo shared by Mo on Oct 1, 2026' });
    expect(older2).toHaveFocus();
    expect(grid().getAllByRole('link')).toHaveLength(2);
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

    await userEvent.click(within((await shown('listitem'))[0]).getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove this photo?')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }));

    expect(own.removePhoto).toHaveBeenCalledWith('p-shared');
    expect(grid().getAllByRole('listitem')).toHaveLength(1);
    expect(onPhotosChanged).toHaveBeenCalledOnce();
    expect(screen.getByText('Your photo was removed.')).toHaveFocus();
  });
});
