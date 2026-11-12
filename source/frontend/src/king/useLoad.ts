import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export type Load<T> = {
  /** What loaded last; null until the first answer. Kept while a reload is on its way. */
  data: T | null;
  /** For pages that edit what they show in place: older pages appended, a hidden photo taken out. */
  setData: Dispatch<SetStateAction<T | null>>;
  /** The latest load failed and nothing has been asked again since. */
  failed: boolean;
  /** Load again, from Try again or after a change; settles when the answer has landed or been dropped. */
  retry: () => Promise<void>;
};

/**
 * Loads `fn` on mount and whenever it changes (wrap it in useCallback), and on `retry`. Only the latest call's answer
 * lands: a slow answer to an earlier call, or to an earlier `fn`, is dropped. With `when`, it loads only while that is
 * true — each time it turns true — and keeps the last answer in between (a page that doesn't show the data doesn't load it).
 */
export function useLoad<T>(fn: () => Promise<T>, when = true): Load<T> {
  const [data, setData] = useState<T | null>(null);
  // The fn that failed: a new fn, or a retry, is not failed until its own answer says so.
  const [failure, setFailure] = useState<(() => Promise<T>) | null>(null);
  const latest = useRef(0);

  const load = useCallback(() => {
    const call = ++latest.current;
    return fn().then(
      (loaded) => {
        if (call === latest.current) setData(loaded);
      },
      () => {
        if (call === latest.current) setFailure(() => fn);
      },
    );
  }, [fn]);

  useEffect(() => {
    if (when) void load();
  }, [load, when]);

  const retry = useCallback(() => {
    setFailure(null);
    return load();
  }, [load]);

  return { data, setData, failed: failure === fn, retry };
}
