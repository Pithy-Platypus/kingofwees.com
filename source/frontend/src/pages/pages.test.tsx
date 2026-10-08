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

  it('says internet addresses are used briefly against spam and not stored', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/internet address/)).toHaveTextContent(/isn’t stored/);
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
});
