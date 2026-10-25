import { vi } from 'vitest';
import { ApiError } from '../king/api';
import type { HeatCell, HistoryPage, KingEventView, KingStatus, kingApi, PhotosPage, PhotoView, SpotView } from '../king/api';
import type { ActivityPage, AdminApi, AdminSignIn, AdminSpot, DeviceView, HiddenDevice, HiddenPhotoView } from '../king/admin';
import type { GeoPoint } from '../king/location';
import type { OwnUndo } from '../king/ownPosts';

export const at = (iso: string) => new Date(iso);
export const NOW = at('2026-10-08T12:00:00Z');

export const event = (overrides: Partial<KingEventView>): KingEventView => ({
  id: 'e1',
  kind: 'fed',
  occurredAt: NOW.toISOString(),
  reporterName: null,
  foods: [],
  sawKing: true,
  spotName: null,
  location: null,
  photoId: null,
  ...overrides,
});

export const photo = (overrides: Partial<PhotoView> = {}): PhotoView => ({
  id: 'p1',
  postedAt: NOW.toISOString(),
  reporterName: null,
  event: null,
  ...overrides,
});

/** A hidden photo as /api/admin/hidden-photos lists it; `hidden` null = hidden before reasons existed. */
export const hiddenPhoto = (overrides: Partial<HiddenPhotoView> = {}): HiddenPhotoView => ({ ...photo(), hidden: null, ...overrides });

export const VERSIONS = { server: { version: '2026.10.18+f349dc1e5d2a' }, frontend: { version: '2026.10.18+f349dc1e5d2a' } };

export const emptyStatus: KingStatus = { lastFed: null, lastSeen: null, recent: [], latestPhoto: null };

export const CENTER: GeoPoint = { latitude: 45.523, longitude: -122.677 };

export const spot = (id: string, name: string): SpotView => ({ id, name, location: CENTER });

type World = {
  map?: GeoPoint | null;
  spots?: SpotView[];
  heat?: HeatCell[];
  history?: HistoryPage;
  posting?: boolean;
  photos?: PhotosPage;
};

// By default the site has no map and no spots, as on a fresh install, and this visitor may post.
export function fakeApi(
  status: KingStatus = emptyStatus,
  { map = null, spots = [], heat = [], history = { events: [], next: null }, posting = true, photos = { photos: [], next: null } }: World = {},
) {
  return {
    getMap: vi.fn<typeof kingApi.getMap>().mockResolvedValue(map),
    getPosting: vi.fn<typeof kingApi.getPosting>().mockResolvedValue(posting),
    listSpots: vi.fn<typeof kingApi.listSpots>().mockResolvedValue(spots),
    addSpot: vi.fn<typeof kingApi.addSpot>().mockImplementation(async (s) => ({ id: 'new-spot', name: s.name, location: s.location })),
    getStatus: vi.fn<typeof kingApi.getStatus>().mockResolvedValue(status),
    getVersion: vi.fn<typeof kingApi.getVersion>().mockResolvedValue(VERSIONS),
    logFeeding: vi.fn<typeof kingApi.logFeeding>().mockImplementation(async (r) =>
      event({ id: 'new-fed', kind: 'fed', foods: r.foods, sawKing: r.sawKing }),
    ),
    logSighting: vi.fn<typeof kingApi.logSighting>().mockResolvedValue(event({ id: 'new-seen', kind: 'seen' })),
    addPhoto: vi.fn<typeof kingApi.addPhoto>().mockImplementation(async (id) => photo({ id: 'new-photo', event: event({ id }) })),
    sharePhoto: vi.fn<typeof kingApi.sharePhoto>().mockImplementation(async (r) => photo({ id: 'shared-photo', reporterName: r.reporterName ?? null })),
    getPhotos: vi.fn<typeof kingApi.getPhotos>().mockResolvedValue(photos),
    getPhoto: vi.fn<typeof kingApi.getPhoto>().mockImplementation(async (id) => {
      const found = photos.photos.find((p) => p.id === id);
      if (!found) throw new ApiError(404);
      return found;
    }),
    undo: vi.fn<typeof kingApi.undo>().mockResolvedValue(undefined),
    deletePhoto: vi.fn<typeof kingApi.deletePhoto>().mockResolvedValue(undefined),
    renameEvent: vi.fn<typeof kingApi.renameEvent>().mockResolvedValue(undefined),
    getHeat: vi.fn<typeof kingApi.getHeat>().mockResolvedValue(heat),
    getHistory: vi.fn<typeof kingApi.getHistory>().mockResolvedValue(history),
  };
}

/** This device's own recent posts: the ids in `mine` can be undone; every undo succeeds unless a test says otherwise. */
export const fakeOwnUndo = (mine: string[] = []) => ({
  canUndo: vi.fn<OwnUndo['canUndo']>((id) => mine.includes(id)),
  remember: vi.fn<OwnUndo['remember']>(),
  undoEntry: vi.fn<OwnUndo['undoEntry']>().mockResolvedValue(undefined),
  removePhoto: vi.fn<OwnUndo['removePhoto']>().mockResolvedValue(undefined),
});

export const ADMIN_KEY = 'test-admin-key';
export const SIGN_IN: AdminSignIn = { key: ADMIN_KEY, name: 'Wallie' };

export const device = (overrides: Partial<DeviceView> = {}): DeviceView => ({
  entries: 1,
  spots: 0,
  reporterName: null,
  newestAt: NOW.toISOString(),
  ...overrides,
});

type AdminWorld = {
  hiddenEntries?: KingEventView[];
  hiddenDevices?: HiddenDevice[];
  device?: DeviceView;
  spots?: AdminSpot[];
  activity?: ActivityPage;
  hiddenPhotos?: HiddenPhotoView[];
};
export const adminSpot = (id: string, name: string, hiddenPoster = false, feedings = 0): AdminSpot => ({ id, name, hiddenPoster, feedings });

// Every admin call succeeds with an empty moderation list unless a test says otherwise.
export function fakeAdminApi({
  hiddenEntries = [],
  hiddenDevices = [],
  device: described = device(),
  spots = [],
  activity = { records: [], next: null },
  hiddenPhotos = [],
}: AdminWorld = {}) {
  return {
    check: vi.fn<AdminApi['check']>().mockResolvedValue(undefined),
    hideEntry: vi.fn<AdminApi['hideEntry']>().mockResolvedValue(undefined),
    unhideEntry: vi.fn<AdminApi['unhideEntry']>().mockResolvedValue(undefined),
    describeDevice: vi.fn<AdminApi['describeDevice']>().mockResolvedValue(described),
    hideDevice: vi.fn<AdminApi['hideDevice']>().mockResolvedValue({ ...described, id: 'hidden-1', hiddenAt: NOW.toISOString() }),
    hiddenEntries: vi.fn<AdminApi['hiddenEntries']>().mockResolvedValue(hiddenEntries),
    hiddenDevices: vi.fn<AdminApi['hiddenDevices']>().mockResolvedValue(hiddenDevices),
    restoreDevice: vi.fn<AdminApi['restoreDevice']>().mockResolvedValue(undefined),
    listSpots: vi.fn<AdminApi['listSpots']>().mockResolvedValue(spots),
    renameSpot: vi.fn<AdminApi['renameSpot']>().mockResolvedValue(undefined),
    activity: vi.fn<AdminApi['activity']>().mockResolvedValue(activity),
    mergeSpots: vi.fn<AdminApi['mergeSpots']>().mockResolvedValue(undefined),
    hidePhoto: vi.fn<AdminApi['hidePhoto']>().mockResolvedValue(undefined),
    showPhoto: vi.fn<AdminApi['showPhoto']>().mockResolvedValue(undefined),
    hiddenPhotos: vi.fn<AdminApi['hiddenPhotos']>().mockResolvedValue(hiddenPhotos),
  };
}
