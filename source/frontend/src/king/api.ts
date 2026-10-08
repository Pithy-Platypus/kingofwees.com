import { roundToBlock, type GeoPoint } from './location';

export type SpotView = { id: string; name: string; location: GeoPoint };

export type Food = 'wet' | 'dry' | 'treats';
export type KingEventView = {
  id: string;
  kind: 'fed' | 'seen';
  occurredAt: string;
  reporterName: string | null;
  foods: Food[];
  sawKing: boolean;
  /** A feeding's spot name; null for sightings and feedings without a spot. */
  spotName: string | null;
  /** A feeding's spot, or where a sighting was logged; null when not given. */
  location: GeoPoint | null;
};
export type KingStatus = { lastFed: KingEventView | null; lastSeen: KingEventView | null; recent: KingEventView[] };
export type Reporter = { reporterKey: string; reporterName?: string | null };

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`API request failed with ${status}`);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new ApiError(response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const postJson = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const kingApi = {
  getStatus: () => request<KingStatus>('/api/king/status', undefined),
  logFeeding: (body: Reporter & { foods: Food[]; sawKing: boolean; spotId?: string }) =>
    postJson<KingEventView>('/api/king/feedings', body),
  // Locations are rounded here, the one place every coordinate leaves the browser (frontend CLAUDE.md).
  logSighting: ({ location, ...body }: Reporter & { location?: GeoPoint }) =>
    postJson<KingEventView>('/api/king/sightings', location ? { ...body, location: roundToBlock(location) } : body),
  listSpots: () => request<SpotView[]>('/api/king/spots', undefined),
  addSpot: ({ location, ...body }: { reporterKey: string; name: string; location: GeoPoint }) =>
    postJson<SpotView>('/api/king/spots', { ...body, location: roundToBlock(location) }),
  // No configured center (404) means the site runs without maps.
  getMap: async (): Promise<GeoPoint | null> => {
    try {
      return (await request<{ center: GeoPoint }>('/api/king/map', undefined)).center;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  undo: (id: string, reporterKey: string) =>
    request<void>(`/api/king/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Reporter-Key': reporterKey },
    }),
};
