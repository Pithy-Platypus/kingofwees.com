import type { ReactNode } from 'react';
import { contactEmail } from '../site';

export function MailLink({ children }: { children: ReactNode }) {
  return (
    <a className="text-link" href={`mailto:${contactEmail}`}>
      {children}
    </a>
  );
}
