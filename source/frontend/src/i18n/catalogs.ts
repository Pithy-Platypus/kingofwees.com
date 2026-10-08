import type { MessageFormatElement } from 'react-intl';
import pseudo from './compiled/en-XA.json';
import type { Locale } from './locale';

// en-US renders the defaultMessage written beside each component; other locales load a compiled catalog.
export const catalogs: Record<Locale, Record<string, MessageFormatElement[]>> = {
  'en-US': {},
  'en-XA': pseudo as Record<string, MessageFormatElement[]>,
};
