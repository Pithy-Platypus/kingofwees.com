import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

// Renders with the source (en-US) messages; missing ids fail loudly instead of falling back silently.
export function renderInEnglish(ui: ReactElement) {
  return render(
    <IntlProvider
      locale="en-US"
      defaultLocale="en-US"
      onError={(error) => {
        throw error;
      }}
    >
      {ui}
    </IntlProvider>,
  );
}
