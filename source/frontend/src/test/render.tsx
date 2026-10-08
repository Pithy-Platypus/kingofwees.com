import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { English } from './English';

// A wrapper, not a parent element, so rerender() keeps the messages.
export function renderInEnglish(ui: ReactElement) {
  return render(ui, { wrapper: English });
}
