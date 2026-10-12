import { defineMessages, FormattedMessage, type MessageTag, type NoMessageValues } from 'react-intl';
import { Link } from '../routing/Link';
import { contactEmail } from '../site';
import { MailLink } from './MailLink';
import { PageShell } from './PageShell';

// Every sentence here is a promise the code must keep; change them together.
type Values = {
  title: NoMessageValues;
  intro: NoMessageValues;
  storedTitle: NoMessageValues;
  storedEvents: NoMessageValues;
  storedName: NoMessageValues;
  storedLocation: NoMessageValues;
  storedSpots: NoMessageValues;
  storedPhotos: { photos: MessageTag };
  photoRemoval: { email: string; mail: MessageTag };
  storedCode: NoMessageValues;
  storedWhere: NoMessageValues;
  notTitle: NoMessageValues;
  notTracking: NoMessageValues;
  notFonts: NoMessageValues;
  notMaps: { policy: MessageTag };
  notIp: NoMessageValues;
  parents: NoMessageValues;
  retention: { email: string; mail: MessageTag; history: MessageTag };
};

const m = defineMessages<Values>({
  title: { id: 'privacy.title', defaultMessage: 'Privacy', description: 'Privacy page heading' },
  intro: { id: 'privacy.intro', defaultMessage: 'We keep as little as possible.', description: 'Opening line of the Privacy page' },
  storedTitle: { id: 'privacy.stored.title', defaultMessage: 'What we keep', description: 'Heading over the list of stored data' },
  storedEvents: {
    id: 'privacy.stored.events',
    defaultMessage: 'When King was fed or seen, what he ate, and the name you gave, if any.',
    description: 'Stored data: the entries themselves',
  },
  storedName: {
    id: 'privacy.stored.name',
    defaultMessage:
      'Your name is optional, and everyone can see it next to your entries, so use a first name or nickname. Your browser remembers it, so you’re only asked once.',
    description: 'Stored data: the optional public nickname, also kept in the browser',
  },
  storedLocation: {
    id: 'privacy.stored.location',
    defaultMessage:
      'Where King was, if you choose to say. It’s rounded to about a block before it leaves your browser, so we never get your exact spot. Your phone’s location is used only when you tap “I’m near him now” or “Use where I am”.',
    description: 'Stored data: optional sighting places, rounded in the browser; when geolocation is used',
  },
  storedSpots: {
    id: 'privacy.stored.spots',
    defaultMessage: 'Feeding spots neighbors add: a name and a place (also rounded), which everyone can see.',
    description: 'Stored data: shared feeding spots are public',
  },
  storedPhotos: {
    id: 'privacy.stored.photos',
    defaultMessage:
      'Photos you add: everyone can see them on the <photos>photos page</photos>, with the name you gave. Your browser shrinks each photo and removes the hidden details phones save in it, including the exact place it was taken, and our server removes them again before storing it.',
    description: 'Stored data: photos are public; location and other metadata removed in the browser and again on the server; keep the <photos></photos> tags around the link text',
  },
  photoRemoval: {
    id: 'privacy.stored.photoRemoval',
    defaultMessage:
      'Undo takes a photo away with its entry (a deleted photo can be recovered for 30 days, then it’s gone). Want a photo taken down later? Email <mail>{email}</mail> and the caretakers will hide it from everyone. Hidden photos are kept rather than deleted, in case the law requires it.',
    description: 'How photos are removed: undo deletes (30-day recovery), takedown requests hide; hidden photos are kept for legal reasons; keep the <mail></mail> tags around {email}',
  },
  storedCode: {
    id: 'privacy.stored.code',
    defaultMessage:
      'A random code saved in your browser, so you can undo your own entries. It isn’t linked to who you are.',
    description: 'Stored data: the per-device undo key',
  },
  storedWhere: {
    id: 'privacy.stored.where',
    defaultMessage:
      'Everything that reaches us is stored with Microsoft Azure in the United States, along with nightly backups that are kept for 30 days.',
    description: 'Where stored data lives: Azure (US), including the nightly backups and how long they are kept',
  },
  notTitle: { id: 'privacy.not.title', defaultMessage: 'What we don’t do', description: 'Heading over the list of things not collected' },
  notTracking: {
    id: 'privacy.not.tracking',
    defaultMessage: 'No accounts, ads, trackers or cookies.',
    description: 'Not collected: accounts, ads, trackers, cookies',
  },
  notFonts: {
    id: 'privacy.not.fonts',
    defaultMessage: 'Our fonts are hosted here, so visiting doesn’t contact Google.',
    description: 'Fonts are self-hosted',
  },
  notMaps: {
    id: 'privacy.not.maps',
    defaultMessage:
      'Maps are the exception: the map pictures load from OpenStreetMap, which sees your internet address and which part of the map you’re looking at. See <policy>OpenStreetMap’s privacy policy</policy>.',
    description: 'Third party: OpenStreetMap tile servers; keep the <policy></policy> tags around the link text',
  },
  notIp: {
    id: 'privacy.not.ip',
    defaultMessage:
      'Your internet address is used for about a minute to stop spam (it limits how often entries can be posted) and to check that posts come from the United States, and isn’t stored — except when someone signs in to the caretakers’ admin page, or tries to: then it’s kept with that sign-in and what they change there, for a year. We remove it from our technical logs.',
    description: 'IP addresses: used briefly for rate limiting and the US-only posting check, stripped from telemetry; kept a year only in the admin activity log',
  },
  parents: {
    id: 'privacy.parents',
    defaultMessage:
      'For parents: kids can help without sharing anything about themselves. If they’d like a name on their entries, help them pick a nickname instead of their real name.',
    description: 'Note for parents about children using the site',
  },
  retention: {
    id: 'privacy.retention',
    defaultMessage:
      'Entries are kept as King’s history, which everyone can see on the <history>history page</history>: every entry with its name, and a map of the places (never more exact than a block). Entries that look like spam can be hidden by the site’s caretakers. Want one removed? Email <mail>{email}</mail>.',
    description: 'Retention, the public history page, and removal requests; keep the <history></history> tags around the link text and the <mail></mail> tags around {email}',
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
          <FormattedMessage {...m.storedName} />
        </li>
        <li>
          <FormattedMessage {...m.storedLocation} />
        </li>
        <li>
          <FormattedMessage {...m.storedSpots} />
        </li>
        <li>
          <FormattedMessage
            {...m.storedPhotos}
            values={{
              photos: (chunks) => (
                <Link to="photos" className="text-link">
                  {chunks}
                </Link>
              ),
            }}
          />
        </li>
        <li>
          <FormattedMessage
            {...m.photoRemoval}
            values={{ email: contactEmail, mail: (chunks) => <MailLink>{chunks}</MailLink> }}
          />
        </li>
        <li>
          <FormattedMessage {...m.storedCode} />
        </li>
        <li>
          <FormattedMessage {...m.storedWhere} />
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
          <FormattedMessage
            {...m.notMaps}
            values={{
              policy: (chunks) => (
                <a href="https://osmfoundation.org/wiki/Privacy_Policy" className="text-link">
                  {chunks}
                </a>
              ),
            }}
          />
        </li>
        <li>
          <FormattedMessage {...m.notIp} />
        </li>
      </ul>
      <p>
        <FormattedMessage
          {...m.retention}
          values={{
            email: contactEmail,
            mail: (chunks) => <MailLink>{chunks}</MailLink>,
            history: (chunks) => (
              <Link to="history" className="text-link">
                {chunks}
              </Link>
            ),
          }}
        />
      </p>
      <p>
        <FormattedMessage {...m.parents} />
      </p>
    </PageShell>
  );
}
