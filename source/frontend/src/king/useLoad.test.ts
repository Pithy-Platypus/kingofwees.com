import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLoad } from './useLoad';

type Answer = { resolve: (value: string) => void; reject: (error: Error) => void };
const pending = () => {
  const answer: Answer = { resolve: () => {}, reject: () => {} };
  const fn = vi.fn(
    () =>
      new Promise<string>((resolve, reject) => {
        answer.resolve = resolve;
        answer.reject = reject;
      }),
  );
  return { fn, answer };
};

describe('useLoad', () => {
  it('loads once on mount and hands over the answer', async () => {
    const fn = vi.fn().mockResolvedValue('first');
    const { result } = renderHook(() => useLoad(fn));

    expect(result.current.data).toBeNull();
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.data).toBe('first'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('lets the latest fn win when an earlier, slower answer arrives after it', async () => {
    const slow = pending();
    const fast = pending();
    const { result, rerender } = renderHook(({ fn }) => useLoad(fn), { initialProps: { fn: slow.fn } });
    rerender({ fn: fast.fn });

    await act(async () => fast.answer.resolve('fast'));
    await waitFor(() => expect(result.current.data).toBe('fast'));
    await act(async () => slow.answer.resolve('slow'));

    expect(result.current.data).toBe('fast');
  });

  it('lets a retry win over the slower call before it', async () => {
    const first = pending();
    const { result } = renderHook(() => useLoad(first.fn));
    const resolveEarlier = first.answer.resolve;

    act(() => {
      void result.current.retry();
    });
    expect(first.fn).toHaveBeenCalledTimes(2);
    await act(async () => first.answer.resolve('later'));
    await act(async () => resolveEarlier('earlier'));

    expect(result.current.data).toBe('later');
  });

  it('is failed only until asked again, and keeps the earlier answer meanwhile', async () => {
    const third = pending();
    const fn = vi.fn().mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(third.fn);
    const { result } = renderHook(() => useLoad(fn));
    await waitFor(() => expect(result.current.data).toBe('first'));

    await act(() => result.current.retry());
    expect(result.current.failed).toBe(true);
    expect(result.current.data).toBe('first');

    let retrying: Promise<void> = Promise.resolve();
    act(() => {
      retrying = result.current.retry();
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.data).toBe('first');
    await act(async () => third.answer.resolve('third'));
    await retrying;
    expect(result.current.data).toBe('third');
  });

  it('drops a failure from an earlier call that lands after a retry succeeded', async () => {
    const first = pending();
    const { result } = renderHook(() => useLoad(first.fn));
    const rejectEarlier = first.answer.reject;

    act(() => {
      void result.current.retry();
    });
    await act(async () => first.answer.resolve('later'));
    await act(async () => rejectEarlier(new Error('offline')));

    expect(result.current.data).toBe('later');
    expect(result.current.failed).toBe(false);
  });

  it('retries the fn of the moment, not the first one', async () => {
    const first = vi.fn().mockResolvedValue('first');
    const second = vi.fn().mockResolvedValue('second');
    const { result, rerender } = renderHook(({ fn }) => useLoad(fn), { initialProps: { fn: first } });
    await waitFor(() => expect(result.current.data).toBe('first'));
    rerender({ fn: second });
    await waitFor(() => expect(result.current.data).toBe('second'));

    await act(() => result.current.retry());

    expect(second).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('forgets a failure when the fn changes', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    const { result, rerender } = renderHook(({ fn }) => useLoad(fn), { initialProps: { fn: failing } });
    await waitFor(() => expect(result.current.failed).toBe(true));

    const working = vi.fn().mockResolvedValue('works');
    rerender({ fn: working });
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.data).toBe('works'));
  });
});
