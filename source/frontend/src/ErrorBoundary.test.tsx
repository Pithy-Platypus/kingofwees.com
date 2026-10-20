import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInEnglish } from './test/render';
import { ErrorBoundary } from './ErrorBoundary';

const fed = 'King was fed';
const seen = 'King was seen';

function Broken(): never {
  throw new Error('Boom');
}

describe('ErrorBoundary', () => {
  // React logs what a boundary caught; the root's onCaughtError reports it (diagnostics.ts).
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('shows the page as usual while nothing breaks', () => {
    renderInEnglish(
      <ErrorBoundary onReload={vi.fn()}>
        <p>{fed}</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('King was fed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });

  it('says something went wrong instead of a blank page, and moves focus there', () => {
    renderInEnglish(
      <ErrorBoundary onReload={vi.fn()}>
        <Broken />
      </ErrorBoundary>,
    );

    const heading = screen.getByRole('heading', { name: 'Something went wrong' });
    expect(heading).toHaveFocus();
    // Focusable from code only: it mustn't join the Tab order.
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Reloading the page usually fixes it. We’ve been told what happened.')).toBeInTheDocument();
  });

  it('keeps showing the page through updates while nothing breaks', () => {
    const { rerender } = renderInEnglish(
      <ErrorBoundary onReload={vi.fn()}>
        <p>{fed}</p>
      </ErrorBoundary>,
    );

    rerender(
      <ErrorBoundary onReload={vi.fn()}>
        <p>{seen}</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText(seen)).toBeInTheDocument();
  });

  it('moves focus there too when a page breaks after it first drew', () => {
    const { rerender } = renderInEnglish(
      <ErrorBoundary onReload={vi.fn()}>
        <p>{fed}</p>
      </ErrorBoundary>,
    );

    rerender(
      <ErrorBoundary onReload={vi.fn()}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toHaveFocus();
  });

  it('reloads the page when asked', async () => {
    const onReload = vi.fn();
    renderInEnglish(
      <ErrorBoundary onReload={onReload}>
        <Broken />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(onReload).toHaveBeenCalledOnce();
  });
});
