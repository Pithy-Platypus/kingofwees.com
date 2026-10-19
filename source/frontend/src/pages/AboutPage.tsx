import { useEffect, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageTag, type NoMessageValues } from 'react-intl';
import { kingApi } from '../king/api';
import { kingAge } from '../king/time';
import { contactEmail } from '../site';
import { MailLink } from './MailLink';
import { PageShell } from './PageShell';
import { SourceLink } from './SourceLink';

type Values = {
  title: NoMessageValues;
  story: { age: number };
  kittenAlt: NoMessageValues;
  kittenCaption: NoMessageValues;
  purpose: NoMessageValues;
  howTitle: NoMessageValues;
  howSeen: NoMessageValues;
  howFed: NoMessageValues;
  howUndo: NoMessageValues;
  honorTitle: NoMessageValues;
  honor: NoMessageValues;
  contact: { email: string; mail: MessageTag };
  source: { code: MessageTag };
  versionTitle: NoMessageValues;
  versionPage: { version: string };
  versionServer: { version: string };
  versionServerChecking: NoMessageValues;
  versionServerFailed: NoMessageValues;
};

const m = defineMessages<Values>({
  title: { id: 'about.title', defaultMessage: 'About King', description: 'About page heading' },
  story: {
    id: 'about.story',
    defaultMessage:
      'King is {age, plural, =8 {an 8} =11 {an 11} =18 {an 18} other {a #}}-year-old long-haired grey cat who did not make the move with his previous owner a few years ago, so the neighborhood decided to look after him together.',
    description: 'King’s story, first paragraph of the About page; {age} is his age in years, worked out from his birth year; the plural only picks “a” or “an”',
  },
  kittenAlt: {
    id: 'about.kitten.alt',
    defaultMessage: 'King as a tiny grey kitten on an orange toy (full-size photo)',
    description: 'Alt text for the photo of King as a kitten; the photo is a link to the full-size picture',
  },
  kittenCaption: {
    id: 'about.kitten.caption',
    defaultMessage: 'King as a kitten — tap for the full-size photo.',
    description: 'Caption under the photo of King as a kitten',
  },
  purpose: {
    id: 'about.purpose',
    defaultMessage: 'This site helps us share the job: when he last ate, what he had, and where he was last seen — so nobody has to guess.',
    description: 'Why the site exists',
  },
  howTitle: { id: 'about.how.title', defaultMessage: 'How it works', description: 'Heading over the how-to list' },
  howSeen: { id: 'about.how.seen', defaultMessage: 'Saw King? Tap “I saw King”.', description: 'How-to step for sightings' },
  howFed: {
    id: 'about.how.fed',
    defaultMessage: 'Fed King? Tap “I fed King”, pick what he ate, and log it.',
    description: 'How-to step for feedings',
  },
  howUndo: {
    id: 'about.how.undo',
    defaultMessage: 'Made a mistake? You can undo for 10 minutes from Lately, the history page or Photos.',
    description: 'How-to step for undo: one’s own entries (Lately on Home, the history page) and shared photos (Photos page)',
  },
  honorTitle: { id: 'about.honor.title', defaultMessage: 'Built on trust', description: 'Heading over the honor-system paragraph' },
  honor: {
    id: 'about.honor',
    defaultMessage:
      'Anyone can post — we trust our neighbors. Entries that look like spam can be hidden by the site’s caretakers. If spam keeps showing up, we’ll add a neighborhood code or sign-in. Kids are welcome to help with a grown-up’s OK.',
    description: 'Explains open posting and what happens if it is abused',
  },
  contact: {
  id: 'about.contact',
  defaultMessage: 'Questions or ideas? Email <mail>{email}</mail>.',
  description: 'Contact line; keep the <mail></mail> tags around {email}',
  },
  source: {
    id: 'about.source',
    defaultMessage: 'Curious how the site works? <code>Its code is public</code> for anyone to read.',
    description: 'Points to the site’s code; the link goes to the exact code of this page on GitHub. Keep the <code></code> tags around the link text',
  },
  versionTitle: { id: 'about.version.title', defaultMessage: 'Version', description: 'Heading over the version lines, for testers' },
  versionPage: {
    id: 'about.version.page',
    defaultMessage: 'This page: {version}',
    description: 'The version of the page running in this browser tab; {version} is like 2026.10.18+f349dc1e5d2a — never translate it',
  },
  versionServer: {
    id: 'about.version.server',
    defaultMessage: 'Server: {version}',
    description: 'The version of the server; {version} is like 2026.10.18+f349dc1e5d2a — never translate it',
  },
  versionServerChecking: { id: 'about.version.server.checking', defaultMessage: 'Server: checking…', description: 'While the server’s version loads' },
  versionServerFailed: { id: 'about.version.server.failed', defaultMessage: 'Server: couldn’t check', description: 'When the server’s version could not be loaded' },
});

// Rich text: <mail>…</mail> becomes the email link, wherever the translation puts it.

type Props = { now: Date; api?: Pick<typeof kingApi, 'getVersion'> };

// The version lines let a tester say exactly which build they saw: this tab's (bundled at build time) and the
// server's, which differ when the tab was opened before a deploy.
export function AboutPage({ now, api = kingApi }: Props) {
  const intl = useIntl();
  const [server, setServer] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.getVersion().then(
      (info) => setServer(info.server.version),
      () => setFailed(true),
    );
  }, [api]);
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      <p>
        <FormattedMessage {...m.story} values={{ age: kingAge(now) }} />
      </p>
      <figure className="page-figure">
        <a href="/king/king-kitten.jpg" className="page-photo-link">
          <img src="/king/king-kitten-small.jpg" alt={intl.formatMessage(m.kittenAlt)} width={480} height={480} className="page-photo" />
        </a>
        <figcaption className="page-caption">
          <FormattedMessage {...m.kittenCaption} />
        </figcaption>
      </figure>
      <p>
        <FormattedMessage {...m.purpose} />
      </p>
      <h2 className="section-title">
        <FormattedMessage {...m.howTitle} />
      </h2>
      <ul className="page-list">
        <li>
          <FormattedMessage {...m.howSeen} />
        </li>
        <li>
          <FormattedMessage {...m.howFed} />
        </li>
        <li>
          <FormattedMessage {...m.howUndo} />
        </li>
      </ul>
      <h2 className="section-title">
        <FormattedMessage {...m.honorTitle} />
      </h2>
      <p>
        <FormattedMessage {...m.honor} />
      </p>
      <p>
        <FormattedMessage {...m.source} values={{ code: (chunks) => <SourceLink>{chunks}</SourceLink> }} />
      </p>
      <p>
        <FormattedMessage {...m.contact} values={{ email: contactEmail, mail: (chunks) => <MailLink>{chunks}</MailLink> }} />
      </p>
      <h2 className="section-title">
        <FormattedMessage {...m.versionTitle} />
      </h2>
      <ul className="page-list">
        <li>
          <FormattedMessage {...m.versionPage} values={{ version: import.meta.env.VITE_APP_VERSION }} />
        </li>
        <li>
          {server !== null ? (
            <FormattedMessage {...m.versionServer} values={{ version: server }} />
          ) : failed ? (
            <FormattedMessage {...m.versionServerFailed} />
          ) : (
            <FormattedMessage {...m.versionServerChecking} />
          )}
        </li>
      </ul>
    </PageShell>
  );
}
