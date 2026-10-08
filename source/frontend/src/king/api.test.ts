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

  it('posts a feeding as JSON and returns the created event', async () => {
    const created = { id: 'e1', kind: 'fed', occurredAt: '2026-10-08T12:00:00Z', reporterName: null, foods: ['dry', 'treats'] };
    respond(201, created);

    await expect(kingApi.logFeeding({ reporterKey: 'k', foods: ['dry', 'treats'] })).resolves.toEqual(created);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/king/feedings');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ reporterKey: 'k', foods: ['dry', 'treats'] });
  });

  it('posts a sighting', async () => {
    respond(201, { id: 'e2', kind: 'seen' });

    await kingApi.logSighting({ reporterKey: 'k' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/king/sightings');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reporterKey: 'k' });
  });

  it('undoes with the reporter key header and an encoded id', async () => {
    respond(204);

    await kingApi.undo('a/b', 'k');

    expect(fetchMock).toHaveBeenCalledWith('/api/king/events/a%2Fb', {
      method: 'DELETE',
      headers: { 'X-Reporter-Key': 'k' },
    });
  });

  it.each([
    ['getStatus', () => kingApi.getStatus()],
    ['logFeeding', () => kingApi.logFeeding({ reporterKey: 'k', foods: [] })],
    ['undo', () => kingApi.undo('e1', 'k')],
  ])('%s throws ApiError carrying the status on failure', async (_name, call) => {
    respond(409, { type: 'undo.expired' });

    const error = await call().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });
});
