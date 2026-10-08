import { render, screen } from '@testing-library/react';
import { FormattedMessage } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from './LocaleProvider';

describe('LocaleProvider', () => {
  it('sets the page language and direction for screen readers and layout', () => {
    render(<LocaleProvider locale="en-XA">{null}</LocaleProvider>);

    expect(document.documentElement.lang).toBe('en-XA');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('uses the source text for en-US', () => {
    render(
      <LocaleProvider locale="en-US">
        <FormattedMessage id="app.name" defaultMessage="King of Wees" />
      </LocaleProvider>,
    );

    expect(screen.getByText('King of Wees')).toBeInTheDocument();
  });

  it('uses the compiled pseudo-locale catalog for en-XA', () => {
    const { container } = render(
      <LocaleProvider locale="en-XA">
        <FormattedMessage id="app.name" defaultMessage="King of Wees" />
      </LocaleProvider>,
    );

    expect(container.textContent).not.toBe('King of Wees');
    expect(container.textContent).not.toBe('');
  });
});
