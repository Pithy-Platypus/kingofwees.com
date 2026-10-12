import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../test/render';
import { DraftPhoto } from './PhotoSlot';

describe('DraftPhoto', () => {
  it('does nothing when the picker closes without a photo', () => {
    const onPick = vi.fn();
    renderInEnglish(<DraftPhoto photo={null} onPick={onPick} onRemove={() => {}} />);

    fireEvent.change(screen.getByLabelText('Add a photo'), { target: { files: [] } });

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
