import { useEffect, useRef, type ReactNode } from 'react';
import { defineMessages, FormattedMessage } from 'react-intl';
import { BackIcon } from '../king/icons';
import { Link } from '../routing/Link';

const m = defineMessages({
  back: { id: 'page.backToKing', defaultMessage: 'Back to King', description: 'Link from About/Privacy back to the home page' },
});

type Props = { title: ReactNode; children: ReactNode };

export function PageShell({ title, children }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <main className="app-screen page">
      <Link to="home" className="back-button">
        <BackIcon className="button-icon" />
        <FormattedMessage {...m.back} />
      </Link>
      <h1 ref={heading} tabIndex={-1} className="screen-title">
        {title}
      </h1>
      {children}
    </main>
  );
}
