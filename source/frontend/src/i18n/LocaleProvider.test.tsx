import { render, screen, waitFor } from '@testing-library/react';
import { FormattedMessage } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from './LocaleProvider';

describe('LocaleProvider', () => {
  it('sets the page language and direction for screen readers and layout', () => {
    render(<LocaleProvider locale="en-XA">{null}</LocaleProvider>);

    expect(document.documentElement.lang).toBe('en-XA');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('uses the source text for en-US, on the first render, with nothing to load', () => {
    render(
      <LocaleProvider locale="en-US">
        <FormattedMessage id="app.name" defaultMessage="King of Wees" />
      </LocaleProvider>,
    );

    expect(screen.getByText('King of Wees')).toBeInTheDocument();
  });

  it('loads the compiled pseudo-locale catalog for en-XA, showing nothing until it arrives', async () => {
    const { container } = render(
      <LocaleProvider locale="en-XA">
        <FormattedMessage id="app.name" defaultMessage="King of Wees" />
      </LocaleProvider>,
    );

    // Never the English source text first: that would flash before the catalog swaps it out.
    expect(container.textContent).toBe('');
    await waitFor(() => expect(container.textContent).not.toBe(''));
    expect(container.textContent).not.toBe('King of Wees');
  });
});
