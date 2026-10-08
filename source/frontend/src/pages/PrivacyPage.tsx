import { defineMessages, FormattedMessage, type MessageTag, type NoMessageValues } from 'react-intl';
import { contactEmail } from '../site';
import { MailLink } from './MailLink';
import { PageShell } from './PageShell';

// Every sentence here is a promise the code must keep; change them together.
type Values = {
  title: NoMessageValues;
  intro: NoMessageValues;
  storedTitle: NoMessageValues;
  storedEvents: NoMessageValues;
  storedCode: NoMessageValues;
  notTitle: NoMessageValues;
  notTracking: NoMessageValues;
  notFonts: NoMessageValues;
  notIp: NoMessageValues;
  parents: NoMessageValues;
  retention: { email: string; mail: MessageTag };
};

const m = defineMessages<Values>({
  title: { id: 'privacy.title', defaultMessage: 'Privacy', description: 'Privacy page heading' },
  intro: { id: 'privacy.intro', defaultMessage: 'We keep as little as possible.', description: 'Opening line of the Privacy page' },
  storedTitle: { id: 'privacy.stored.title', defaultMessage: 'What we keep', description: 'Heading over the list of stored data' },
  storedEvents: {
    id: 'privacy.stored.events',
    defaultMessage: 'When King was fed or seen, and what he ate.',
    description: 'Stored data: the entries themselves',
  },
  storedCode: {
    id: 'privacy.stored.code',
    defaultMessage:
      'A random code saved in your browser, so you can undo your own entries. It isn’t linked to who you are.',
    description: 'Stored data: the per-device undo key',
  },
  notTitle: { id: 'privacy.not.title', defaultMessage: 'What we don’t do', description: 'Heading over the list of things not collected' },
  notTracking: {
    id: 'privacy.not.tracking',
    defaultMessage: 'No accounts, ads, trackers or cookies. We don’t ask for your name.',
    description: 'Not collected: accounts, ads, trackers, cookies, names',
  },
  notFonts: {
    id: 'privacy.not.fonts',
    defaultMessage: 'Our fonts are hosted here, so visiting doesn’t contact Google.',
    description: 'Fonts are self-hosted',
  },
  notIp: {
    id: 'privacy.not.ip',
    defaultMessage:
      'Your internet address is used for about a minute to stop spam (it limits how often entries can be posted) and isn’t stored. We remove it from our technical logs.',
    description: 'IP addresses: used briefly for rate limiting, stripped from telemetry',
  },
  parents: {
    id: 'privacy.parents',
    defaultMessage: 'For parents: kids can help without sharing anything about themselves.',
    description: 'Note for parents about children using the site',
  },
  retention: {
  id: 'privacy.retention',
  defaultMessage: 'Entries are kept as King’s history. Want one removed? Email <mail>{email}</mail>.',
  description: 'Retention and removal requests; keep the <mail></mail> tags around {email}',
  },
});


export function PrivacyPage() {
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      <p>
        <FormattedMessage {...m.intro} />
      </p>
      <h2 className="section-title">
        <FormattedMessage {...m.storedTitle} />
      </h2>
      <ul className="page-list">
        <li>
          <FormattedMessage {...m.storedEvents} />
        </li>
        <li>
          <FormattedMessage {...m.storedCode} />
        </li>
      </ul>
      <h2 className="section-title">
        <FormattedMessage {...m.notTitle} />
      </h2>
      <ul className="page-list">
        <li>
          <FormattedMessage {...m.notTracking} />
        </li>
        <li>
          <FormattedMessage {...m.notFonts} />
        </li>
        <li>
          <FormattedMessage {...m.notIp} />
        </li>
      </ul>
      <p>
        <FormattedMessage {...m.retention} values={{ email: contactEmail, mail: (chunks) => <MailLink>{chunks}</MailLink> }} />
      </p>
      <p>
        <FormattedMessage {...m.parents} />
      </p>
    </PageShell>
  );
}
