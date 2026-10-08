import { defineMessages, FormattedMessage } from 'react-intl';
import { Link } from './routing/Link';

const m = defineMessages({
  credit: {
    id: 'footer.credit',
    defaultMessage: 'Brought to you by King’s neighbors on Guy St.',
    description: 'Footer credit; Guy St. is the street name and stays as is',
  },
  copyright: { id: 'footer.copyright', defaultMessage: '© 2026', description: 'Copyright year for the site content' },
  site: { id: 'footer.siteLinks', defaultMessage: 'Site', description: 'Accessible name for the footer link list' },
  about: { id: 'footer.about', defaultMessage: 'About', description: 'Footer link to the About page' },
  privacy: { id: 'footer.privacy', defaultMessage: 'Privacy', description: 'Footer link to the Privacy page' },
});

export function Footer() {
  return (
    <footer className="site-footer">
      <p>
        <FormattedMessage {...m.credit} /> <FormattedMessage {...m.copyright} />
      </p>
      <nav aria-labelledby="footer-links">
        <span id="footer-links" className="sr-only">
          <FormattedMessage {...m.site} />
        </span>
        <ul className="footer-links">
          <li>
            <Link to="about" className="footer-link">
              <FormattedMessage {...m.about} />
            </Link>
          </li>
          <li>
            <Link to="privacy" className="footer-link">
              <FormattedMessage {...m.privacy} />
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
