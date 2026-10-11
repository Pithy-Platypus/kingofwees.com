import { useMemo } from 'react';
import { useIntl } from 'react-intl';

// Sorted for the reader's language (the server returns them oldest first).
export function useSpotsByName<T extends { name: string }>(spots: T[]): T[] {
  const { locale } = useIntl();
  return useMemo(() => {
    const collator = new Intl.Collator(locale);
    return [...spots].sort((a, b) => collator.compare(a.name, b.name));
  }, [spots, locale]);
}
