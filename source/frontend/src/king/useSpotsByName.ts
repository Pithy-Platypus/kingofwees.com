import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import type { SpotView } from './api';

// Sorted for the reader's language (the server returns them oldest first).
export function useSpotsByName(spots: SpotView[]): SpotView[] {
  const { locale } = useIntl();
  return useMemo(() => {
    const collator = new Intl.Collator(locale);
    return [...spots].sort((a, b) => collator.compare(a.name, b.name));
  }, [spots, locale]);
}
