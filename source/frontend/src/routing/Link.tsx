import type { MouseEvent, ReactNode } from 'react';
import { navigate, pathOf, type Route } from './routes';

type Props = { to: Route; className?: string; children: ReactNode };

// A real <a href>, so links work without JavaScript and open in new tabs; plain clicks stay in the app.
export function Link({ to, className, children }: Props) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={pathOf(to)} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
