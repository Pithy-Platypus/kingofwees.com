import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, kingApi } from './api';

const fetchMock = vi.fn();

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status }));

describe('kingApi', () => {
  it('gets the status', async () => {
    const status = { lastFed: null, lastSeen: null, recent: [] };
    respond(200, status);

    await expect(kingApi.getStatus()).resolves.toEqual(status);
    expect(fetchMock).toHaveBeenCalledWith('/api/king/status', undefined);
  });

  it.each([
    ['seen', 30, '/api/king/heat?layer=seen&days=30'],
    ['fed', 7, '/api/king/heat?layer=fed&days=7'],
    ['seen', 'all', '/api/king/heat?layer=seen'],
  ] as const)('gets the %s heat cells for %s days', async (layer, range, url) => {
    const cells = [{ location: { latitude: 45.523, longitude: -122.677 }, count: 2, spotName: null }];
    respond(200, { cells });

    await expect(kingApi.getHeat(layer, range)).resolves.toEqual(cells);
    expect(fetchMock).toHaveBeenCalledWith(url, undefined);
  });

  it.each([
    [undefined, '/api/king/history'],
    ['id/with?odd&chars', '/api/king/history?before=id%2Fwith%3Fodd%26chars'],
  ])('gets a page of history before %s', async (before, url) => {
    const page = { events: [], next: 'e9' };
    respond(200, page);

    await expect(kingApi.getHistory(before)).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith(url, undefined);
  });

  it('posts a feeding as JSON and returns the created event', async () => {
    const created = { id: 'e1', kind: 'fed', occurredAt: '2026-10-08T12:00:00Z', reporterName: 'Sunny', foods: ['dry', 'treats'], sawKing: false };
    respond(201, created);

    await expect(
      kingApi.logFeeding({ reporterKey: 'k', reporterName: 'Sunny', foods: ['dry', 'treats'], sawKing: false }),
    ).resolves.toEqual(created);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/king/feedings');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ reporterKey: 'k', reporterName: 'Sunny', foods: ['dry', 'treats'], sawKing: false });
  });

  it('posts a sighting', async () => {
    respond(201, { id: 'e2', kind: 'seen' });

    await kingApi.logSighting({ reporterKey: 'k' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/king/sightings');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reporterKey: 'k' });
  });

  it('posts a sighting with its location rounded to about a block, whatever precision it was given', async () => {
    respond(201, { id: 'e3', kind: 'seen' });

    await kingApi.logSighting({ reporterKey: 'k', location: { latitude: 45.523456, longitude: -122.676543 } });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      reporterKey: 'k',
      location: { latitude: 45.523, longitude: -122.677 },
    });
  });

  it('adds a spot with its location rounded', async () => {
    const created = { id: 's1', name: 'Corner', location: { latitude: 45.523, longitude: -122.677 } };
    respond(201, created);

    await expect(
      kingApi.addSpot({ reporterKey: 'k', name: 'Corner', location: { latitude: 45.523456, longitude: -122.676543 } }),
    ).resolves.toEqual(created);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/king/spots');
    expect(JSON.parse(init.body)).toEqual({ reporterKey: 'k', name: 'Corner', location: { latitude: 45.523, longitude: -122.677 } });
  });

  it('lists the spots', async () => {
    respond(200, []);

    await expect(kingApi.listSpots()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/api/king/spots', undefined);
  });

  it('gets the map center, or null when the site has no map', async () => {
    respond(200, { center: { latitude: 45.523, longitude: -122.677 } });
    respond(404);

    await expect(kingApi.getMap()).resolves.toEqual({ latitude: 45.523, longitude: -122.677 });
    await expect(kingApi.getMap()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/king/map', undefined);
  });

  it('undoes with the reporter key header and an encoded id', async () => {
    respond(204);

    await kingApi.undo('a/b', 'k');

    expect(fetchMock).toHaveBeenCalledWith('/api/king/events/a%2Fb', {
      method: 'DELETE',
      headers: { 'X-Reporter-Key': 'k' },
    });
  });

  it('renames an entry with the reporter key header and an encoded id; no name is sent as null', async () => {
    respond(204);
    respond(204);

    await kingApi.renameEvent('a/b', 'k', 'Kael');
    await kingApi.renameEvent('a/b', 'k', null);

    const headers = { 'X-Reporter-Key': 'k', 'Content-Type': 'application/json' };
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/king/events/a%2Fb', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ reporterName: 'Kael' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/king/events/a%2Fb', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ reporterName: null }),
    });
  });

  it.each([
    ['getStatus', () => kingApi.getStatus()],
    ['logFeeding', () => kingApi.logFeeding({ reporterKey: 'k', foods: [], sawKing: true })],
    ['undo', () => kingApi.undo('e1', 'k')],
    ['getMap', () => kingApi.getMap()],
  ])('%s throws ApiError carrying the status on failure', async (_name, call) => {
    respond(409, { type: 'undo.expired' });

    const error = await call().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });
});
