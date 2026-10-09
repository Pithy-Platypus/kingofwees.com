import { useEffect, useState, type ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import { loadCatalog, type Catalog } from './catalogs';
import { defaultLocale, directionOf, type Locale } from './locale';

type Props = { locale: Locale; children: ReactNode };

export function LocaleProvider({ locale, children }: Props) {
  // The default locale needs no catalog, so it renders at once; another shows nothing until its catalog arrives,
  // rather than flashing the English source text first.
  const [loaded, setLoaded] = useState<{ locale: Locale; messages: Catalog } | null>(
    locale === defaultLocale ? { locale, messages: {} } : null,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  useEffect(() => {
    let current = true;
    void loadCatalog(locale).then((messages) => {
      if (current) setLoaded({ locale, messages });
    });
    return () => {
      current = false;
    };
  }, [locale]);

  if (loaded?.locale !== locale) return null;

  return (
    <IntlProvider locale={locale} defaultLocale={defaultLocale} messages={loaded.messages}>
      {children}
    </IntlProvider>
  );
}
