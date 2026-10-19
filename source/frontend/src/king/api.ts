import { roundToBlock, type GeoPoint } from './location';
import type { PhotoFiles } from './photo';

export type SpotView = { id: string; name: string; location: GeoPoint };
/** The server's limit for a place's name (AddSpotRequestValidator.MaxNameLength), new or renamed. */
export const SPOT_NAME_MAX_LENGTH = 40;
/** The server's limit for a nickname (ReporterRules.MaxNameLength); it cuts an admin's typed name to it too. */
export const NICKNAME_MAX_LENGTH = 40;

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
  /** The entry's photo while visitors may see it, else null. */
  photoId: string | null;
};
/** A photo on an entry (`event`, shown as in history) or shared on its own (`event` null). */
export type PhotoView = { id: string; postedAt: string; reporterName: string | null; event: KingEventView | null };
/** `latestPhoto` is the newest visible photo of any kind: Home's avatar. */
export type KingStatus = {
  lastFed: KingEventView | null;
  lastSeen: KingEventView | null;
  recent: KingEventView[];
  latestPhoto: PhotoView | null;
};
/** `next` is the id to pass as `before` for the older page; null on the last page. */
export type PhotosPage = { photos: PhotoView[]; next: string | null };
export type HeatLayer = 'seen' | 'fed';
export type HeatRange = 7 | 30 | 'all';
export type HeatCell = { location: GeoPoint; count: number; spotName: string | null };
/** `next` is the id to pass as `before` for the older page; null on the last page. */
export type HistoryPage = { events: KingEventView[]; next: string | null };
export type Reporter = { reporterKey: string; reporterName?: string | null };
/** `/api/version`: the server's build and the frontend build it serves (null where it serves none, as in development). */
export type VersionInfo = { server: { version: string }; frontend: { version: string | null } };

export class ApiError extends Error {
  readonly status: number;
  readonly codes: string[];
  constructor(status: number, codes: string[] = []) {
    super(`API request failed with ${status}`);
    this.status = status;
    this.codes = codes;
  }
}

// The server's validation 400s list error codes per field ({ errors: { name: ['name.taken'] } }); other failures have none.
async function validationCodes(response: Response): Promise<string[]> {
  try {
    const body = (await response.json()) as { errors?: Record<string, string[]> };
    return Object.values(body.errors ?? {}).flat();
  } catch {
    return [];
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new ApiError(response.status, await validationCodes(response));
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const postJson = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const photoForm = ({ photo, thumbnail }: PhotoFiles) => {
  const form = new FormData();
  form.append('photo', photo, 'photo.jpg');
  form.append('thumbnail', thumbnail, 'thumbnail.jpg');
  return form;
};

/** Where a photo's files are served (only while visitors may see it). */
export const photoUrl = (id: string, size: 'full' | 'thumb') => `/api/king/photos/${encodeURIComponent(id)}/${size}`;

export const kingApi = {
  getStatus: () => request<KingStatus>('/api/king/status', undefined),
  getVersion: () => request<VersionInfo>('/api/version', undefined),
  logFeeding: (body: Reporter & { foods: Food[]; sawKing: boolean; spotId?: string }) =>
    postJson<KingEventView>('/api/king/feedings', body),
  // Locations are rounded here, the one place every coordinate leaves the browser (frontend CLAUDE.md).
  logSighting: ({ location, ...body }: Reporter & { location?: GeoPoint }) =>
    postJson<KingEventView>('/api/king/sightings', location ? { ...body, location: roundToBlock(location) } : body),
  listSpots: () => request<SpotView[]>('/api/king/spots', undefined),
  addSpot: ({ location, ...body }: { reporterKey: string; name: string; location: GeoPoint }) =>
    postJson<SpotView>('/api/king/spots', { ...body, location: roundToBlock(location) }),
  // False only for a known address outside the US, when the site checks (the server refuses those posts anyway).
  getPosting: async () => (await request<{ allowed: boolean }>('/api/king/posting', undefined)).allowed,
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
  // Same device and time window as undo; only on a sighting or a feeding where King was seen.
  addPhoto: (id: string, reporterKey: string, files: PhotoFiles) =>
    request<PhotoView>(`/api/king/events/${encodeURIComponent(id)}/photo`, {
      method: 'POST',
      headers: { 'X-Reporter-Key': reporterKey },
      body: photoForm(files),
    }),
  // A photo on its own, not tied to an entry: never a sighting. The key goes in the header, as for addPhoto: the server
  // refuses it in the form, which any other site could make a browser post.
  sharePhoto: ({ reporterKey, reporterName }: Reporter, files: PhotoFiles) => {
    const form = photoForm(files);
    if (reporterName) form.append('reporterName', reporterName);
    return request<PhotoView>('/api/king/photos', {
      method: 'POST',
      headers: { 'X-Reporter-Key': reporterKey },
      body: form,
    });
  },
  getPhotos: (before?: string) =>
    request<PhotosPage>(`/api/king/photos${before === undefined ? '' : `?before=${encodeURIComponent(before)}`}`, undefined),
  undo: (id: string, reporterKey: string) =>
    request<void>(`/api/king/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Reporter-Key': reporterKey },
    }),
};

/** A write refused because it came from outside the US (the server's 403, code `posting.outsideUs`). */
export const isPostingRefused = (error: unknown) => error instanceof ApiError && error.status === 403;
