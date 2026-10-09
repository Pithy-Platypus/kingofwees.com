import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { fakeApi, NOW } from './test/fakeApi';
import { renderInEnglish } from './test/render';

const renderAt = (path: string) => {
  window.history.replaceState(null, '', path);
  renderInEnglish(<App api={fakeApi()} reporterKey="k" now={() => NOW} />);
};

const footer = () => within(screen.getByRole('contentinfo'));

describe('routing', () => {
  it('titles the home page King of Wees', async () => {
    renderAt('/');

    await screen.findByRole('button', { name: 'I fed King' });
    expect(document.title).toBe('King of Wees');
  });

  it.each([
    ['/about', 'About King', 'About · King of Wees'],
    ['/privacy', 'Privacy', 'Privacy · King of Wees'],
    ['/history', 'King’s history', 'History · King of Wees'],
    ['/admin', 'Admin', 'Admin · King of Wees'],
  ])('opens %s directly with its heading focused and its own title', async (path, heading, title) => {
    renderAt(path);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toHaveFocus();
    expect(document.title).toBe(title);
  });

  it('follows footer links without reloading and goes back with the browser', async () => {
    renderAt('/');
    await screen.findByRole('button', { name: 'I fed King' });

    await userEvent.click(footer().getByRole('link', { name: 'About' }));
    expect(window.location.pathname).toBe('/about');
    expect(await screen.findByRole('heading', { level: 1, name: 'About King' })).toHaveFocus();

    await userEvent.click(footer().getByRole('link', { name: 'Privacy' }));
    expect(window.location.pathname).toBe('/privacy');
    expect(document.title).toBe('Privacy · King of Wees');

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'About King' })).toBeInTheDocument();
  });

  it('reaches the history from the footer and from under Lately on Home', async () => {
    renderAt('/');
    await screen.findByRole('button', { name: 'I fed King' });

    await userEvent.click(footer().getByRole('link', { name: 'History' }));
    expect(window.location.pathname).toBe('/history');
    expect(await screen.findByRole('heading', { level: 1, name: 'King’s history' })).toHaveFocus();

    await userEvent.click(screen.getByRole('link', { name: 'Back to King' }));
    await userEvent.click(await screen.findByRole('link', { name: 'See King’s history' }));
    expect(window.location.pathname).toBe('/history');
  });

  it('leaves Ctrl/Cmd-clicks to the browser so links can open in a new tab', async () => {
    renderAt('/');
    const about = (await screen.findByRole('contentinfo')).querySelector('a[href="/about"]')!;
    expect(about).toHaveAttribute('href', '/about');

    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(about);
    await user.keyboard('{/Control}');

    expect(window.location.pathname).toBe('/');
  });

  it('links back home from a page', async () => {
    renderAt('/about');

    await userEvent.click(await screen.findByRole('link', { name: 'Back to King' }));

    expect(window.location.pathname).toBe('/');
    expect(await screen.findByRole('button', { name: 'I fed King' })).toBeInTheDocument();
  });

  it('shows the home page for an unknown path', async () => {
    renderAt('/no-such-page');

    expect(await screen.findByRole('button', { name: 'I fed King' })).toBeInTheDocument();
  });

  it('doesn’t advertise the admin page', async () => {
    renderAt('/');

    await screen.findByRole('button', { name: 'I fed King' });
    expect(footer().queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
  });

  it('credits the neighbors in the footer', async () => {
    renderAt('/');

    expect(await screen.findByRole('contentinfo')).toHaveTextContent('Brought to you by King’s neighbors on Guy St.');
  });
});
