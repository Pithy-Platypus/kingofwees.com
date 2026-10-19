import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../test/render';
import { ApiError } from './api';
import { UndoOwnPost } from './UndoOwnPost';

const renderUndo = (what: 'fed' | 'seen' | 'photo' = 'fed', confirm = vi.fn(async () => {})) => {
  const onDone = vi.fn();
  renderInEnglish(<UndoOwnPost what={what} onConfirm={confirm} onDone={onDone} />);
  return { confirm, onDone };
};

describe('UndoOwnPost', () => {
  it('takes no focus and says nothing until asked', () => {
    renderUndo('fed');

    expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks in place before undoing, and undoes only on yes', async () => {
    const { confirm, onDone } = renderUndo('fed');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByText('Undo this feeding?')).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Undo it' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('keeps it on "Keep it", with focus back on Undo', async () => {
    const { confirm } = renderUndo('seen');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Undo this sighting?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
  });

  it('says a photo is removed, not undone', async () => {
    const { confirm } = renderUndo('photo');

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove this photo?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }));

    expect(confirm).toHaveBeenCalledOnce();
  });

  it.each([
    ['fed', 'It’s too late to undo — entries can only be undone for 10 minutes.'],
    ['photo', 'It’s too late to remove it — photos can only be removed for 10 minutes.'],
  ] as const)('says when the 10 minutes are over (%s) and offers it no more', async (what, message) => {
    const { onDone } = renderUndo(what, vi.fn(async () => Promise.reject(new ApiError(409))));

    await userEvent.click(screen.getByRole('button', { name: what === 'photo' ? 'Remove' : 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: what === 'photo' ? 'Remove it' : 'Undo it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('says when it failed and lets them try again', async () => {
    const confirm = vi.fn(async () => {});
    confirm.mockRejectedValueOnce(new ApiError(503));
    const { onDone } = renderUndo('fed', confirm);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t undo it. Try again.');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo it' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('disables both answers while undoing, so it is sent once', async () => {
    let finish = () => {};
    const confirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderUndo('fed', confirm);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo it' }));

    expect(screen.getByRole('button', { name: 'Undo it' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled();
    finish();
  });
});
