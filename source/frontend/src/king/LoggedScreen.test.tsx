import { describe, expect, it } from 'vitest';
import { event } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';
import { LoggedScreen } from './LoggedScreen';

const noop = () => {};
const picture = (kind: 'fed' | 'seen') => {
  const { container } = renderInEnglish(
    <LoggedScreen event={event({ kind })} nickname="" undoFailed={false} busy={false} onUndo={noop} onDone={noop} onChangeName={noop} />,
  );
  return container.querySelector('img.logged-photo')!;
};

describe('LoggedScreen — the picture of King', () => {
  // Shown as a 176 px circle: small square copies (352 px for sharp screens), not the 664–900 px originals (114–194 kB).
  it.each([
    ['seen', '/king/king-sitting-small.jpg'],
    ['fed', '/king/king-licking-small.jpg'],
  ] as const)('a %s confirmation shows the small square copy, as decoration', (kind, src) => {
    const img = picture(kind);

    expect(img).toHaveAttribute('src', src);
    expect(img).toHaveAttribute('alt', '');
  });
});
