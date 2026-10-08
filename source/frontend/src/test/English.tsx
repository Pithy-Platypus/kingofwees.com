import type { ReactNode } from 'react';
import { IntlProvider } from 'react-intl';

// Source (en-US) messages; missing ids fail loudly instead of falling back silently.
export function English({ children }: { children: ReactNode }) {
  return (
    <IntlProvider
      locale="en-US"
      defaultLocale="en-US"
      onError={(error) => {
        throw error;
      }}
    >
      {children}
    </IntlProvider>
  );
}
