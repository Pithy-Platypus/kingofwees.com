import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contactEmail } from '../site';
import { fakeApi } from '../test/fakeApi';
import { renderInEnglish } from '../test/render';
import { AboutPage } from './AboutPage';
import { PrivacyPage } from './PrivacyPage';

const NOW = new Date(2026, 9, 12);
const contactLink = () => screen.getByRole('link', { name: contactEmail });
const renderAbout = (now = NOW, api = fakeApi()) => renderInEnglish(<AboutPage now={now} api={api} />);

describe('AboutPage', () => {
  it('tells King’s story and why the site exists', () => {
    renderAbout();

    expect(
      screen.getByText(
        'King is an 11-year-old long-haired grey cat who did not make the move with his previous owner a few years ago, so the neighborhood decided to look after him together.',
      ),
    ).toBeInTheDocument();
  });

  it('gives King’s age from his birth year, with the right article', () => {
    renderAbout(new Date(2027, 0, 1));

    expect(screen.getByText(/^King is a 12-year-old long-haired grey cat/)).toBeInTheDocument();
  });

  it('shows King as a kitten, linked to the full-size photo', () => {
    renderAbout();

    const link = screen.getByRole('link', { name: 'King as a tiny grey kitten on an orange toy (full-size photo)' });
    expect(link).toHaveAttribute('href', '/king/king-kitten.jpg');
    expect(within(link).getByRole('img')).toHaveAttribute('src', '/king/king-kitten-small.jpg');
    expect(screen.getByText('King as a kitten — tap for the full-size photo.')).toBeInTheDocument();
  });

  it('explains the honor system and what happens if spam appears', () => {
    renderAbout();

    expect(screen.getByText(/Anyone can post/)).toBeInTheDocument();
    expect(screen.getByText(/neighborhood code or sign-in/)).toBeInTheDocument();
  });

  it('says spam can be hidden by the caretakers, and a code comes only if it keeps showing up', () => {
    renderAbout();

    expect(screen.getByText(/Anyone can post/)).toHaveTextContent(
      'Entries that look like spam can be hidden by the site’s caretakers. If spam keeps showing up,',
    );
  });

  it('offers an email link for questions', () => {
    renderAbout();

    expect(contactLink()).toHaveAttribute('href', `mailto:${contactEmail}`);
  });

  it('shows this page’s version, as source/version.sh prints it', () => {
    renderAbout();

    expect(import.meta.env.VITE_APP_VERSION).toMatch(/^\d{4}\.[1-9]\d?\.[1-9]\d?\+[0-9a-f]{12}(\.dirty)?$/);
    expect(screen.getByText(`This page: ${import.meta.env.VITE_APP_VERSION}`)).toBeInTheDocument();
  });

  it('shows the server’s version once it has loaded', async () => {
    const api = fakeApi();
    api.getVersion.mockResolvedValue({ server: { version: '2026.10.19+0123456789ab' }, frontend: { version: null } });
    renderAbout(NOW, api);

    expect(screen.getByText('Server: checking…')).toBeInTheDocument();
    expect(await screen.findByText('Server: 2026.10.19+0123456789ab')).toBeInTheDocument();
  });

  it('says when the server’s version couldn’t be checked', async () => {
    const api = fakeApi();
    api.getVersion.mockRejectedValue(new Error('offline'));
    renderAbout(NOW, api);

    expect(await screen.findByText('Server: couldn’t check')).toBeInTheDocument();
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

  it('says where everything is stored: Microsoft Azure in the United States, with nightly backups kept 30 days', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/Microsoft Azure/, { selector: 'li' })).toHaveTextContent(
      'Everything that reaches us is stored with Microsoft Azure in the United States, along with nightly backups that are kept for 30 days.',
    );
  });

  it('says internet addresses are used briefly against spam and not stored — except for admin sign-ins, kept a year', () => {
    renderInEnglish(<PrivacyPage />);

    const promise = screen.getByText(/to stop spam/);
    expect(promise).toHaveTextContent(/isn’t stored/);
    expect(promise).toHaveTextContent('and to check that posts come from the United States');
    expect(promise).toHaveTextContent(
      'except when someone signs in to the caretakers’ admin page, or tries to: then it’s kept with that sign-in and what they change there, for a year.',
    );
  });

  it('explains the random undo code kept in the browser', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/random code/)).toHaveTextContent(/undo/);
  });

  it('says entries are kept for King’s history and can be removed by email', () => {
    renderInEnglish(<PrivacyPage />);

    const retention = screen.getByText(/kept as King’s history/);
    expect(within(retention).getByRole('link', { name: contactEmail })).toHaveAttribute('href', `mailto:${contactEmail}`);
  });

  it('says the history and its map are public, and links to them', () => {
    renderInEnglish(<PrivacyPage />);

    const retention = screen.getByText(/kept as King’s history/);
    expect(retention).toHaveTextContent(/everyone can see/);
    expect(retention).toHaveTextContent(/map of the places/);
    expect(screen.getByRole('link', { name: 'history page' })).toHaveAttribute('href', '/history');
  });

  it('says entries that look like spam can be hidden by the caretakers', () => {
    renderInEnglish(<PrivacyPage />);

    expect(screen.getByText(/kept as King’s history/)).toHaveTextContent('Entries that look like spam can be hidden by the site’s caretakers.');
  });

  it('says photos are public on the photos page, and that the place a phone saves in a photo is removed twice', () => {
    renderInEnglish(<PrivacyPage />);

    const photos = screen.getByText(/Photos you add/);
    expect(photos).toHaveTextContent(/everyone can see them/);
    expect(photos).toHaveTextContent(/including the exact place it was taken/);
    expect(photos).toHaveTextContent(/our server removes them again/);
    expect(screen.getByRole('link', { name: 'photos page' })).toHaveAttribute('href', '/photos');
  });

  it('says how a photo goes away: undo deletes it, a takedown hides it, and hidden photos are kept', () => {
    renderInEnglish(<PrivacyPage />);

    const removal = screen.getByText(/Undo takes a photo away/);
    expect(removal).toHaveTextContent(/recovered for 30 days/);
    expect(removal).toHaveTextContent(/the caretakers will hide it from everyone/);
    expect(removal).toHaveTextContent(/Hidden photos are kept rather than deleted/);
    expect(removal.querySelector(`a[href="mailto:${contactEmail}"]`)).not.toBeNull();
  });
});
