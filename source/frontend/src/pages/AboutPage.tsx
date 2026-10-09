import { defineMessages, FormattedMessage, type MessageTag, type NoMessageValues } from 'react-intl';
import { contactEmail } from '../site';
import { MailLink } from './MailLink';
import { PageShell } from './PageShell';

type Values = {
  title: NoMessageValues;
  story: NoMessageValues;
  purpose: NoMessageValues;
  howTitle: NoMessageValues;
  howSeen: NoMessageValues;
  howFed: NoMessageValues;
  howUndo: NoMessageValues;
  honorTitle: NoMessageValues;
  honor: NoMessageValues;
  contact: { email: string; mail: MessageTag };
};

const m = defineMessages<Values>({
  title: { id: 'about.title', defaultMessage: 'About King', description: 'About page heading' },
  story: {
    id: 'about.story',
    defaultMessage:
      'King is an 11-year-old grey long-haired cat. His owner left him behind two years ago, so the neighbors on his street decided to look after him together.',
    description: 'King’s story, first paragraph of the About page',
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
  howUndo: { id: 'about.how.undo', defaultMessage: 'Made a mistake? You can undo for 10 minutes.', description: 'How-to step for undo' },
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
});

// Rich text: <mail>…</mail> becomes the email link, wherever the translation puts it.

export function AboutPage() {
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      <p>
        <FormattedMessage {...m.story} />
      </p>
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
        <FormattedMessage {...m.contact} values={{ email: contactEmail, mail: (chunks) => <MailLink>{chunks}</MailLink> }} />
      </p>
    </PageShell>
  );
}
