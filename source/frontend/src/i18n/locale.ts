// en-XA is the pseudo-locale: reachable only via ?locale=en-XA, to spot untranslated text.
export const supportedLocales = ['en-US', 'en-XA'] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = 'en-US';

const browserLocales: readonly Locale[] = ['en-US'];
const rightToLeftLanguages = new Set(['ar', 'fa', 'he', 'ur']);

/** The language part of a BCP 47 tag ('en-US' → 'en'), lower-cased. */
const languageOf = (tag: string) => (tag.split('-')[0] ?? tag).toLowerCase();

export function resolveLocale(search: string, preferred: readonly string[]): Locale {
  const requested = new URLSearchParams(search).get('locale');
  const exact = supportedLocales.find((l) => l === requested);
  if (exact) return exact;

  for (const tag of preferred) {
    const language = languageOf(tag);
    const match = browserLocales.find((l) => languageOf(l) === language);
    if (match) return match;
  }
  return defaultLocale;
}

export function directionOf(locale: string): 'ltr' | 'rtl' {
  return rightToLeftLanguages.has(languageOf(locale)) ? 'rtl' : 'ltr';
}
