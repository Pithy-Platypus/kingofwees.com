import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockedStorage, memoryStorage } from '../test/memoryStorage';
import { adminApi, isKeyRejected, loadAdminSignIn, looksLikeKeyHash, saveAdminSignIn } from './admin';
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
const WHO = { key: KEY, name: '' };
const bearer = { headers: { Authorization: `Bearer ${KEY}` } };

describe('admin key on this device', () => {
  it('is remembered, and forgotten on sign out', () => {
    const storage = memoryStorage();
    expect(loadAdminSignIn(storage)).toBeNull();

    saveAdminSignIn(storage, WHO);
    expect(loadAdminSignIn(storage)).toEqual(WHO);

    saveAdminSignIn(storage, null);
    expect(loadAdminSignIn(storage)).toBeNull();
  });

  it('remembers the name typed at sign-in with the key, and forgets both on sign out', () => {
    const storage = memoryStorage();

    saveAdminSignIn(storage, { key: KEY, name: 'Wallie' });
    expect(loadAdminSignIn(storage)).toEqual({ key: KEY, name: 'Wallie' });

    saveAdminSignIn(storage, null);
    expect(loadAdminSignIn(storage)).toBeNull();
    saveAdminSignIn(storage, WHO);
    expect(loadAdminSignIn(storage)).toEqual(WHO);
  });

  it('has no name on a device that signed in before names were asked', () => {
    const storage = memoryStorage();
    storage.setItem('kingofwees.adminKey', KEY);

    expect(loadAdminSignIn(storage)).toEqual({ key: KEY, name: '' });
  });

  it('is simply not remembered when storage is blocked', () => {
    expect(() => saveAdminSignIn(blockedStorage, WHO)).not.toThrow();
    expect(loadAdminSignIn(blockedStorage)).toBeNull();
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

    await expect(adminApi.check(WHO)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/check', bearer);
  });

  it('reports a wrong key as a 401', async () => {
    respond(401);

    await expect(adminApi.check({ key: 'wrong', name: '' })).rejects.toEqual(new ApiError(401));
  });

  it.each([
    ['hideEntry', 'POST', '/api/admin/events/a%2Fb/hide'],
    ['unhideEntry', 'DELETE', '/api/admin/events/a%2Fb/hide'],
    ['restoreDevice', 'DELETE', '/api/admin/hidden/a%2Fb'],
    ['hidePhoto', 'POST', '/api/admin/photos/a%2Fb/hide'],
    ['showPhoto', 'DELETE', '/api/admin/photos/a%2Fb/hide'],
  ] as const)('%s sends %s %s', async (call, method, url) => {
    respond(204);

    await adminApi[call](WHO, 'a/b');

    expect(fetchMock).toHaveBeenCalledWith(url, { method, ...bearer });
  });

  it('describes the device behind an entry', async () => {
    const summary = { entries: 3, spots: 1, reporterName: 'Sam', newestAt: '2026-10-08T12:00:00Z' };
    respond(200, summary);

    await expect(adminApi.describeDevice(WHO, 'e1')).resolves.toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/events/e1/device', bearer);
  });

  it('hides the device behind an entry', async () => {
    const hidden = { id: 'h1', hiddenAt: '2026-10-08T12:00:00Z', entries: 3, spots: 1, reporterName: null, newestAt: null };
    respond(200, hidden);

    await expect(adminApi.hideDevice(WHO, 'e1')).resolves.toEqual(hidden);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/events/e1/hide-device', { method: 'POST', ...bearer });
  });

  it.each([
    ['hiddenEntries', '/api/admin/hidden-entries'],
    ['hiddenDevices', '/api/admin/hidden'],
    ['hiddenPhotos', '/api/admin/hidden-photos'],
  ] as const)('lists %s', async (call, url) => {
    respond(200, []);

    await expect(adminApi[call](WHO)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(url, bearer);
  });
});

describe('adminApi.listSpots', () => {
  it('gets every place with the key only in the header', async () => {
    respond(200, [{ id: 's1', name: 'Porch', hiddenPoster: true }]);

    expect(await adminApi.listSpots(WHO)).toEqual([{ id: 's1', name: 'Porch', hiddenPoster: true }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/spots', bearer);
  });
});

describe('adminApi.renameSpot', () => {
  it('posts the place and its new name, with the key only in the header', async () => {
    respond(204);

    await adminApi.renameSpot(WHO, 's/1', 'Front porch');

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/spots/rename', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotId: 's/1', name: 'Front porch' }),
    });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(KEY);
  });
});

describe('the name typed at sign-in', () => {
  it('goes beside the key on every call, URL-encoded because headers are ASCII', async () => {
    respond(204);
    respond(204);
    const who = { key: KEY, name: 'José Ünal' };

    await adminApi.check(who);
    await adminApi.renameSpot(who, 's1', 'Porch');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/check', {
      headers: { Authorization: `Bearer ${KEY}`, 'X-Admin-Name': 'Jos%C3%A9%20%C3%9Cnal' },
    });
    expect(fetchMock.mock.calls[1][1].headers).toEqual({
      Authorization: `Bearer ${KEY}`,
      'X-Admin-Name': 'Jos%C3%A9%20%C3%9Cnal',
      'Content-Type': 'application/json',
    });
  });
});

describe('adminApi.activity', () => {
  it('gets the newest page, then an older one by the last id shown', async () => {
    const page = { records: [], next: null };
    respond(200, page);
    respond(200, page);

    expect(await adminApi.activity(WHO)).toEqual(page);
    await adminApi.activity(WHO, 'a/b');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/activity', bearer);
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/activity?before=a%2Fb', bearer);
  });
});

describe('adminApi.mergeSpots', () => {
  it('posts the kept place, the merged ones and a new name, with the key only in the header', async () => {
    respond(204);
    respond(204);

    await adminApi.mergeSpots(WHO, 's1', ['s2', 's3'], 'Front porch');
    await adminApi.mergeSpots(WHO, 's1', ['s2']);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/spots/merge', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId: 's1', mergeIds: ['s2', 's3'], name: 'Front porch' }),
    });
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ keepId: 's1', mergeIds: ['s2'], name: null }));
  });
});
