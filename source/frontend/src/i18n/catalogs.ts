import type { MessageFormatElement } from 'react-intl';
import type { Locale } from './locale';

export type Catalog = Record<string, MessageFormatElement[]>;

// en-US renders the defaultMessage written beside each component, so it has nothing to load. Other catalogs are
// fetched only when that locale is asked for: the en-XA pseudo-locale is for testing, and a static import would
// put it in every visitor's download (it pushed the bundle past Vite's 500 kB warning).
export const loadCatalog = async (locale: Locale): Promise<Catalog> =>
  locale === 'en-US' ? {} : ((await import('./compiled/en-XA.json')).default as Catalog);
