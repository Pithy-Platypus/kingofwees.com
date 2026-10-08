import { useEffect, type ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import { catalogs } from './catalogs';
import { defaultLocale, directionOf, type Locale } from './locale';

type Props = { locale: Locale; children: ReactNode };

export function LocaleProvider({ locale, children }: Props) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  return (
    <IntlProvider locale={locale} defaultLocale={defaultLocale} messages={catalogs[locale]}>
      {children}
    </IntlProvider>
  );
}
