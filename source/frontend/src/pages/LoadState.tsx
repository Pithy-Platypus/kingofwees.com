import type { ReactNode } from 'react';
import { FormattedMessage, type MessageDescriptor } from 'react-intl';
import { common } from '../king/messages';

type Messages = { loading: MessageDescriptor; failed: MessageDescriptor; empty?: MessageDescriptor };

type Props<T> = {
  /** What loaded; null while loading. */
  data: T | null;
  failed: boolean;
  onRetry: () => Promise<void>;
  messages: Messages;
  /** With `messages.empty`: the answer holds nothing to show. */
  isEmpty?: (data: T) => boolean;
  children?: (data: T) => ReactNode;
};

/** The states every load shares — failed with Try again, loading, empty — then what loaded, through `children`. */
export function LoadState<T>({ data, failed, onRetry, messages, isEmpty, children }: Props<T>) {
  if (failed) {
    return (
      <>
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...messages.failed} />
        </div>
        <button type="button" className="done-button" onClick={() => void onRetry()}>
          <FormattedMessage {...common.tryAgain} />
        </button>
      </>
    );
  }
  if (data === null) {
    return (
      <p role="status">
        <FormattedMessage {...messages.loading} />
      </p>
    );
  }
  if (messages.empty && isEmpty?.(data)) {
    return (
      <p className="activity-detail">
        <FormattedMessage {...messages.empty} />
      </p>
    );
  }
  return <>{children?.(data)}</>;
}
