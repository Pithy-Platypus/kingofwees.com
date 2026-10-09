import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockedStorage, memoryStorage } from '../test/memoryStorage';
import { adminApi, isKeyRejected, loadAdminKey, looksLikeKeyHash, saveAdminKey } from './admin';
import { ApiError } from './api';

const fetchMock = vi.fn();

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status }));

const KEY = 'the-admin-key';
const bearer = { headers: { Authorization: `Bearer ${KEY}` } };

describe('admin key on this device', () => {
  it('is remembered, and forgotten on sign out', () => {
    const storage = memoryStorage();
    expect(loadAdminKey(storage)).toBeNull();

    saveAdminKey(storage, KEY);
    expect(loadAdminKey(storage)).toBe(KEY);

    saveAdminKey(storage, null);
    expect(loadAdminKey(storage)).toBeNull();
  });

  it('is simply not remembered when storage is blocked', () => {
    expect(() => saveAdminKey(blockedStorage, KEY)).not.toThrow();
    expect(loadAdminKey(blockedStorage)).toBeNull();
  });
});

describe('looksLikeKeyHash', () => {
  it.each([
    ['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', true],
    ['  BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD  ', true],
    ['Q2hhbmdlTWVJbkFUZXN0S2V5MDEyMzQ1Njc4OWFiY2Q', false], // shaped like a key: 43 URL-safe Base64 characters
    ['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015a', false], // 63
    ['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015adf', false], // 65
    ['ga7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', false], // not hex
  ])('%s → %s', (text, expected) => {
    expect(looksLikeKeyHash(text)).toBe(expected);
  });
});

describe('isKeyRejected', () => {
  it('is true only for a 401', () => {
    expect(isKeyRejected(new ApiError(401))).toBe(true);
    expect(isKeyRejected(new ApiError(429))).toBe(false);
    expect(isKeyRejected(new Error('offline'))).toBe(false);
  });
});

describe('adminApi', () => {
  it('checks a key', async () => {
    respond(204);

    await expect(adminApi.check(KEY)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/check', bearer);
  });

  it('reports a wrong key as a 401', async () => {
    respond(401);

    await expect(adminApi.check('wrong')).rejects.toEqual(new ApiError(401));
  });

  it.each([
    ['hideEntry', 'POST', '/api/admin/events/a%2Fb/hide'],
    ['unhideEntry', 'DELETE', '/api/admin/events/a%2Fb/hide'],
    ['restoreDevice', 'DELETE', '/api/admin/hidden/a%2Fb'],
  ] as const)('%s sends %s %s', async (call, method, url) => {
    respond(204);

    await adminApi[call](KEY, 'a/b');

    expect(fetchMock).toHaveBeenCalledWith(url, { method, ...bearer });
  });

  it('describes the device behind an entry', async () => {
    const summary = { entries: 3, spots: 1, reporterName: 'Sam', newestAt: '2026-10-08T12:00:00Z' };
    respond(200, summary);

    await expect(adminApi.describeDevice(KEY, 'e1')).resolves.toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/events/e1/device', bearer);
  });

  it('hides the device behind an entry', async () => {
    const hidden = { id: 'h1', hiddenAt: '2026-10-08T12:00:00Z', entries: 3, spots: 1, reporterName: null, newestAt: null };
    respond(200, hidden);

    await expect(adminApi.hideDevice(KEY, 'e1')).resolves.toEqual(hidden);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/events/e1/hide-device', { method: 'POST', ...bearer });
  });

  it.each([
    ['hiddenEntries', '/api/admin/hidden-entries'],
    ['hiddenDevices', '/api/admin/hidden'],
  ] as const)('lists %s', async (call, url) => {
    respond(200, []);

    await expect(adminApi[call](KEY)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(url, bearer);
  });
});
