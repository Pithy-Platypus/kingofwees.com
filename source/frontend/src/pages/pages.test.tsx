import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contactEmail } from '../site';
import { renderInEnglish } from '../test/render';
import { AboutPage } from './AboutPage';
import { PrivacyPage } from './PrivacyPage';

const contactLink = () => screen.getByRole('link', { name: contactEmail });

describe('AboutPage', () => {
  it('tells King’s story and why the site exists', () => {
    renderInEnglish(<AboutPage />);

    expect(screen.getByText(/11-year-old/)).toBeInTheDocument();
    expect(screen.getByText(/left him behind two years ago/)).toBeInTheDocument();
  });

  it('explains the honor system and what happens if spam appears', () => {
    renderInEnglish(<AboutPage />);

    expect(screen.getByText(/Anyone can post/)).toBeInTheDocument();
    expect(screen.getByText(/neighborhood code or sign-in/)).toBeInTheDocument();
  });

  it('offers an email link for questions', () => {
    renderInEnglish(<AboutPage />);

    expect(contactLink()).toHaveAttribute('href', `mailto:${contactEmail}`);
  });
});

describe('PrivacyPage', () => {
  it('promises no accounts, ads, trackers or cookies', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/No accounts, ads, trackers or cookies/)).toBeInTheDocument();
  });

  it('no longer promises not to ask for a name, now that names are optional', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.queryByText(/don’t ask for your name/)).not.toBeInTheDocument();
  });

  it('says a name is optional, shown to everyone, and best as a first name or nickname', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/name is optional/)).toHaveTextContent(/everyone can see it/);
    expect(screen.getByText(/name is optional/)).toHaveTextContent(/first name or nickname/);
  });

  it('suggests parents help kids pick a nickname', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/For parents/)).toHaveTextContent(/nickname instead of their real name/);
  });

  it('says a place is rounded to about a block in the browser, and only asked for on a tap', () => {
    renderInEnglish(<PrivacyPage />);

    const location = screen.getByText(/rounded to about a block/);
    expect(location).toHaveTextContent(/before it leaves your browser/);
    expect(location).toHaveTextContent(/only when you tap/);
  });

  it('says feeding spots and their names are public', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/Feeding spots/)).toHaveTextContent(/everyone can see/);
  });

  it('says map pictures come from OpenStreetMap, which sees your internet address, and links their policy', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/OpenStreetMap/, { selector: 'li' })).toHaveTextContent(/internet address/);
    expect(screen.getByRole('link', { name: 'OpenStreetMap’s privacy policy' })).toHaveAttribute(
      'href',
      'https://osmfoundation.org/wiki/Privacy_Policy',
    );
  });

  it('says internet addresses are used briefly against spam and not stored', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/to stop spam/)).toHaveTextContent(/isn’t stored/);
  });

  it('explains the random undo code kept in the browser', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/random code/)).toHaveTextContent(/undo/);
  });

  it('says entries are kept for King’s history and can be removed by email', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/kept as King’s history/)).toBeInTheDocument();
    expect(contactLink()).toHaveAttribute('href', `mailto:${contactEmail}`);
  });

  it('says the history and its map are public, and links to them', () => {
    renderInEnglish(<PrivacyPage />);

    const retention = screen.getByText(/kept as King’s history/);
    expect(retention).toHaveTextContent(/everyone can see/);
    expect(retention).toHaveTextContent(/map of the places/);
    expect(screen.getByRole('link', { name: 'history page' })).toHaveAttribute('href', '/history');
  });
});
