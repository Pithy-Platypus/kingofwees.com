import { Component, createRef, type ReactNode } from 'react';
import { defineMessages, FormattedMessage } from 'react-intl';

const m = defineMessages({
  title: { id: 'broken.title', defaultMessage: 'Something went wrong', description: 'Heading shown instead of a page that failed to draw' },
  hint: {
    id: 'broken.hint',
    defaultMessage: 'Reloading the page usually fixes it. We’ve been told what happened.',
    description: 'Under “Something went wrong”: the site sent a report of the failure (what broke and on which page)',
  },
  reload: { id: 'broken.reload', defaultMessage: 'Reload', description: 'Button that reloads a page that failed to draw' },
});

type Props = { children: ReactNode; onReload: () => void };

/** Instead of a blank page when a screen fails to draw; the root's onCaughtError reports it (diagnostics.ts). */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  private readonly heading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // A page that breaks on its first draw mounts the boundary already failed; a later break updates it.
  componentDidMount() {
    this.heading.current?.focus();
  }

  componentDidUpdate() {
    this.heading.current?.focus();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-screen page">
        <h1 ref={this.heading} tabIndex={-1} className="screen-title">
          <FormattedMessage {...m.title} />
        </h1>
        <p className="screen-hint">
          <FormattedMessage {...m.hint} />
        </p>
        <button type="button" className="done-button" onClick={this.props.onReload}>
          <FormattedMessage {...m.reload} />
        </button>
      </main>
    );
  }
}
