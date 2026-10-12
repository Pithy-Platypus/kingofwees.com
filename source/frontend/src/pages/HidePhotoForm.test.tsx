import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../test/render';
import { HidePhotoForm } from './HidePhotoForm';

const renderForm = (onEntry = true, busy = false) => {
  const onHide = vi.fn();
  const onCancel = vi.fn();
  renderInEnglish(<HidePhotoForm onEntry={onEntry} busy={busy} onHide={onHide} onCancel={onCancel} />);
  return { onHide, onCancel };
};

const reasons = () => within(screen.getByRole('group', { name: 'Why hide it?' }));
const hide = () => screen.getByRole('button', { name: 'Hide photo' });
const note = () => screen.getByRole('textbox', { name: /^Note/ });

describe('HidePhotoForm', () => {
  it('asks in place, taking focus, and says the entry stays for a photo on an entry', () => {
    renderForm();

    expect(screen.getByText('Hide this photo from everyone? The entry stays.')).toHaveFocus();
  });

  it('asks without the entry for a shared photo', () => {
    renderForm(false);

    expect(screen.getByText('Hide this photo from everyone?')).toHaveFocus();
  });

  it('offers the five reasons, none picked', () => {
    renderForm();

    expect(reasons().getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([
      'Not King',
      'Shows a person',
      'Rude or off-topic',
      'Possibly unlawful',
      'Other',
    ]);
    expect(reasons().getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false);
  });

  it('hides only once a reason is picked, with no note when none is written', async () => {
    const { onHide } = renderForm();
    expect(hide()).toBeDisabled();

    await userEvent.click(reasons().getByRole('radio', { name: 'Not King' }));
    await userEvent.click(hide());

    expect(onHide).toHaveBeenCalledWith('notKing', null);
  });

  it('shows the picked reason as picked, and only that one', async () => {
    renderForm();

    await userEvent.click(reasons().getByRole('radio', { name: 'Rude or off-topic' }));

    expect(reasons().getByRole('radio', { name: 'Rude or off-topic' })).toBeChecked();
    expect(reasons().getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('sends the note trimmed', async () => {
    const { onHide } = renderForm();

    await userEvent.click(reasons().getByRole('radio', { name: 'Possibly unlawful' }));
    await userEvent.type(note(), '  reported to NCMEC  ');
    await userEvent.click(hide());

    expect(onHide).toHaveBeenCalledWith('unlawful', 'reported to NCMEC');
  });

  it('needs a note for Other, and says so', async () => {
    const { onHide } = renderForm();

    await userEvent.click(reasons().getByRole('radio', { name: 'Other' }));

    expect(note()).toHaveAccessibleName('Note (required for Other)');
    expect(note()).toBeRequired();
    expect(hide()).toBeDisabled();
    await userEvent.type(note(), '   ');
    expect(hide()).toBeDisabled();
    await userEvent.type(note(), 'a thumb over the lens');
    await userEvent.click(hide());
    expect(onHide).toHaveBeenCalledWith('other', 'a thumb over the lens');
  });

  it('calls the note optional for every other reason', async () => {
    renderForm();

    expect(note()).toHaveAccessibleName('Note (optional)');
    await userEvent.click(reasons().getByRole('radio', { name: 'Shows a person' }));
    expect(note()).toHaveAccessibleName('Note (optional)');
    expect(note()).not.toBeRequired();
  });

  it('keeps the note within the 200 characters the server accepts', () => {
    renderForm();

    expect(note()).toHaveAttribute('maxLength', '200');
  });

  it('Cancel hides nothing', async () => {
    const { onHide, onCancel } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('can’t be sent twice while hiding', async () => {
    renderForm(true, true);

    await userEvent.click(reasons().getByRole('radio', { name: 'Not King' }));

    expect(hide()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
