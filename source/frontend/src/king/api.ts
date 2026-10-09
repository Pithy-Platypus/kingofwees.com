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
export type HeatLayer = 'seen' | 'fed';
export type HeatRange = 7 | 30 | 'all';
export type HeatCell = { location: GeoPoint; count: number; spotName: string | null };
/** `next` is the id to pass as `before` for the older page; null on the last page. */
export type HistoryPage = { events: KingEventView[]; next: string | null };
export type Reporter = { reporterKey: string; reporterName?: string | null };

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`API request failed with ${status}`);
    this.status = status;
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
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
  getHeat: async (layer: HeatLayer, range: HeatRange): Promise<HeatCell[]> =>
    (await request<{ cells: HeatCell[] }>(`/api/king/heat?layer=${layer}${range === 'all' ? '' : `&days=${range}`}`, undefined)).cells,
  getHistory: (before?: string) =>
    request<HistoryPage>(`/api/king/history${before === undefined ? '' : `?before=${encodeURIComponent(before)}`}`, undefined),
  // Same device and time window as undo; null clears the name.
  renameEvent: (id: string, reporterKey: string, reporterName: string | null) =>
    request<void>(`/api/king/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'X-Reporter-Key': reporterKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporterName }),
    }),
  undo: (id: string, reporterKey: string) =>
    request<void>(`/api/king/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Reporter-Key': reporterKey },
    }),
};
