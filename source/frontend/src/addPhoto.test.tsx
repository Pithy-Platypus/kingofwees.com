import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { ApiError, type PhotoView } from './king/api';
import type { PhotoFiles, PhotoResizer } from './king/photo';
import { saveNickname } from './king/reporter';
import { fakeApi, NOW } from './test/fakeApi';
import { memoryStorage } from './test/memoryStorage';
import { renderInEnglish } from './test/render';

const KEY = 'device-key';
const RESIZED: PhotoFiles = { photo: new Blob(['full']), thumbnail: new Blob(['thumb']) };
const picked = () => new File(['camera bytes'], 'IMG_0001.heic', { type: 'image/heic' });

const renderApp = (api = fakeApi(), resize: PhotoResizer = vi.fn(async () => RESIZED)) => {
  const storage = memoryStorage();
  saveNickname(storage, '');
  renderInEnglish(<App api={api} reporterKey={KEY} storage={storage} now={() => NOW} resize={resize} />);
  return { api, resize };
};

const addPhoto = () => screen.getByLabelText('Add a photo');
const pickPhoto = async () => userEvent.upload(addPhoto(), picked());
const startSighting = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'I saw King' }));
  await screen.findByRole('heading', { name: 'Where is King?' });
};
const startFeeding = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'I fed King' }));
  await screen.findByRole('heading', { name: 'What did King eat?' });
};
const logWithoutPlace = () => userEvent.click(screen.getByRole('button', { name: 'Log without a place' }));
const leftOut = () => screen.getByRole('checkbox', { name: 'I left food out (didn’t see him)' });

const pending = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('App — adding a photo while logging', () => {
  it('shrinks the picked photo, shows it, then posts the sighting first and the photo after it', async () => {
    const { api, resize } = renderApp();
    await startSighting();

    await pickPhoto();

    expect(resize).toHaveBeenCalledWith(expect.objectContaining({ name: 'IMG_0001.heic' }));
    expect(await screen.findByRole('img', { name: 'The photo you picked' })).toBeInTheDocument();
    await logWithoutPlace();

    await waitFor(() => expect(api.addPhoto).toHaveBeenCalledWith('new-seen', KEY, RESIZED));
    expect(api.logSighting.mock.invocationCallOrder[0]).toBeLessThan(api.addPhoto.mock.invocationCallOrder[0]);
    expect(await screen.findByText('Photo added')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The photo you added' })).toBeInTheDocument();
  });

  it('adds the photo to a feeding where King was seen', async () => {
    const { api } = renderApp();
    await startFeeding();

    await pickPhoto();
    await screen.findByRole('img', { name: 'The photo you picked' });
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    await waitFor(() => expect(api.addPhoto).toHaveBeenCalledWith('new-fed', KEY, RESIZED));
  });

  it('offers no photo while “I left food out” is ticked, and never sends one picked before ticking it', async () => {
    const { api } = renderApp();
    await startFeeding();
    await pickPhoto();
    await screen.findByRole('img', { name: 'The photo you picked' });

    await userEvent.click(leftOut());

    expect(screen.queryByLabelText('Add a photo')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'The photo you picked' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    await screen.findByRole('heading', { name: 'Feast logged!' });
    expect(api.addPhoto).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Add a photo')).not.toBeInTheDocument();
  });

  it('“Remove photo” takes the picked photo back before logging, returning focus to “Add a photo”', async () => {
    const { api } = renderApp();
    await startSighting();
    await pickPhoto();

    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));

    expect(screen.queryByRole('img', { name: 'The photo you picked' })).not.toBeInTheDocument();
    expect(addPhoto()).toHaveFocus();
    await logWithoutPlace();
    await screen.findByRole('heading', { name: 'Thanks for spotting King!' });
    expect(api.addPhoto).not.toHaveBeenCalled();
  });

  it('moves focus to “Remove photo” once the picked photo is shown, so the keyboard isn’t lost', async () => {
    renderApp();
    await startSighting();

    await pickPhoto();

    expect(await screen.findByRole('button', { name: 'Remove photo' })).toHaveFocus();
  });

  it('waits for the photo to be ready before logging, so it can’t be left behind', async () => {
    const ready = pending<PhotoFiles>();
    const { api } = renderApp(fakeApi(), () => ready.promise);
    await startSighting();

    await pickPhoto();

    expect(screen.getByRole('status')).toHaveTextContent('Getting your photo ready…');
    expect(screen.getByRole('button', { name: 'Log without a place' })).toBeDisabled();
    ready.resolve(RESIZED);
    await screen.findByRole('img', { name: 'The photo you picked' });
    await logWithoutPlace();
    await waitFor(() => expect(api.addPhoto).toHaveBeenCalledWith('new-seen', KEY, RESIZED));
  });

  it('says so when the browser can’t use the photo, and still logs without it', async () => {
    const { api } = renderApp(fakeApi(), async () => Promise.reject(new Error('cannot decode')));
    await startSighting();

    await pickPhoto();

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t use that photo. Try another one.');
    expect(addPhoto()).toBeInTheDocument();
    await logWithoutPlace();
    await screen.findByRole('heading', { name: 'Thanks for spotting King!' });
    expect(api.addPhoto).not.toHaveBeenCalled();
  });

  it('keeps the picked photo while a new feeding spot is added', async () => {
    const { api } = renderApp();
    await startFeeding();
    await pickPhoto();
    await screen.findByRole('img', { name: 'The photo you picked' });

    await userEvent.click(screen.getByRole('button', { name: 'Somewhere new' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('img', { name: 'The photo you picked' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));
    await waitFor(() => expect(api.addPhoto).toHaveBeenCalled());
  });

  it('starts the next entry with no photo picked', async () => {
    renderApp();
    await startSighting();
    await pickPhoto();
    await screen.findByRole('img', { name: 'The photo you picked' });
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await startSighting();

    expect(screen.queryByRole('img', { name: 'The photo you picked' })).not.toBeInTheDocument();
    expect(addPhoto()).toBeInTheDocument();
  });
});

describe('App — the photo after the entry is logged', () => {
  it('keeps the entry when the photo can’t be added, and Retry sends the same photo again', async () => {
    const api = fakeApi();
    api.addPhoto.mockRejectedValueOnce(new ApiError(503));
    renderApp(api);
    await startSighting();
    await pickPhoto();
    await screen.findByRole('img', { name: 'The photo you picked' });
    await logWithoutPlace();

    expect(await screen.findByRole('alert')).toHaveTextContent('Your photo couldn’t be added. Your sighting is saved.');
    expect(screen.getByRole('heading', { name: 'Thanks for spotting King!' })).toBeInTheDocument();
    expect(api.undo).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(api.addPhoto).toHaveBeenCalledTimes(2);
    expect(api.addPhoto).toHaveBeenLastCalledWith('new-seen', KEY, RESIZED);
    expect(await screen.findByText('Photo added')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says a feeding is saved when its photo fails', async () => {
    const api = fakeApi();
    api.addPhoto.mockRejectedValueOnce(new ApiError(503));
    renderApp(api);
    await startFeeding();
    await pickPhoto();
    await screen.findByRole('img', { name: 'The photo you picked' });
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your photo couldn’t be added. Your feeding is saved.');
  });

  it('says when it’s too late to add the photo, with no Retry', async () => {
    const api = fakeApi();
    api.addPhoto.mockRejectedValue(new ApiError(409));
    renderApp(api);
    await startSighting();
    await logWithoutPlace();
    await screen.findByRole('heading', { name: 'Thanks for spotting King!' });

    await pickPhoto();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'It’s too late to add a photo — photos can only be added for 10 minutes.',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a photo')).not.toBeInTheDocument();
  });

  it('keeps Undo off while the photo is still sending', async () => {
    const sent = pending<PhotoView>();
    const api = fakeApi();
    api.addPhoto.mockReturnValue(sent.promise);
    renderApp(api);
    await startSighting();
    await pickPhoto();
    await screen.findByRole('img', { name: 'The photo you picked' });
    await logWithoutPlace();

    expect(await screen.findByRole('status')).toHaveTextContent('Adding your photo…');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    sent.reject(new ApiError(503));
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('“Add a photo” on the confirmation sends it to the entry right away, then offers no second one', async () => {
    const { api } = renderApp();
    await startSighting();
    await logWithoutPlace();
    await screen.findByRole('heading', { name: 'Thanks for spotting King!' });

    await pickPhoto();

    await waitFor(() => expect(api.addPhoto).toHaveBeenCalledWith('new-seen', KEY, RESIZED));
    expect(await screen.findByText('Photo added')).toHaveFocus();
    expect(screen.queryByLabelText('Add a photo')).not.toBeInTheDocument();
  });

  it('offers no photo on the confirmation of a left-out feeding', async () => {
    renderApp();
    await startFeeding();
    await userEvent.click(leftOut());
    await userEvent.click(screen.getByRole('button', { name: 'Log feeding' }));

    await screen.findByRole('heading', { name: 'Feast logged!' });

    expect(screen.queryByLabelText('Add a photo')).not.toBeInTheDocument();
  });

  it('Retry after a failure on the confirmation gets focus, so the keyboard lands on it', async () => {
    const api = fakeApi();
    api.addPhoto.mockRejectedValueOnce(new ApiError(503));
    renderApp(api);
    await startSighting();
    await logWithoutPlace();
    await screen.findByRole('heading', { name: 'Thanks for spotting King!' });

    await pickPhoto();

    expect(await screen.findByRole('button', { name: 'Retry' })).toHaveFocus();
  });
});
