import type { ReactNode } from 'react';
import { sourceUrl } from '../site';

export function SourceLink({ children }: { children: ReactNode }) {
  return (
    <a className="text-link" href={sourceUrl}>
      {children}
    </a>
  );
}
