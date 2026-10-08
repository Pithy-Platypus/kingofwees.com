// en-XA is the pseudo-locale: reachable only via ?locale=en-XA, to spot untranslated text.
export const supportedLocales = ['en-US', 'en-XA'] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = 'en-US';

const browserLocales: readonly Locale[] = ['en-US'];
const rightToLeftLanguages = new Set(['ar', 'fa', 'he', 'ur']);

export function resolveLocale(search: string, preferred: readonly string[]): Locale {
  const requested = new URLSearchParams(search).get('locale');
  const exact = supportedLocales.find((l) => l === requested);
  if (exact) return exact;

  for (const tag of preferred) {
    const language = tag.split('-')[0].toLowerCase();
    const match = browserLocales.find((l) => l.split('-')[0].toLowerCase() === language);
    if (match) return match;
  }
  return defaultLocale;
}

export function directionOf(locale: string): 'ltr' | 'rtl' {
  return rightToLeftLanguages.has(locale.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';
}
