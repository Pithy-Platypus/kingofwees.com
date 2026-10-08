import { vi } from 'vitest';
import type { HeatCell, HistoryPage, KingEventView, KingStatus, kingApi, SpotView } from '../king/api';
import type { GeoPoint } from '../king/location';

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
  ...overrides,
});

export const emptyStatus: KingStatus = { lastFed: null, lastSeen: null, recent: [] };

export const CENTER: GeoPoint = { latitude: 45.523, longitude: -122.677 };

export const spot = (id: string, name: string): SpotView => ({ id, name, location: CENTER });

type World = { map?: GeoPoint | null; spots?: SpotView[]; heat?: HeatCell[]; history?: HistoryPage };

// By default the site has no map and no spots, as on a fresh install.
export function fakeApi(status: KingStatus = emptyStatus, { map = null, spots = [], heat = [], history = { events: [], next: null } }: World = {}) {
  return {
    getMap: vi.fn<typeof kingApi.getMap>().mockResolvedValue(map),
    listSpots: vi.fn<typeof kingApi.listSpots>().mockResolvedValue(spots),
    addSpot: vi.fn<typeof kingApi.addSpot>().mockImplementation(async (s) => ({ id: 'new-spot', name: s.name, location: s.location })),
    getStatus: vi.fn<typeof kingApi.getStatus>().mockResolvedValue(status),
    logFeeding: vi.fn<typeof kingApi.logFeeding>().mockImplementation(async (r) =>
      event({ id: 'new-fed', kind: 'fed', foods: r.foods }),
    ),
    logSighting: vi.fn<typeof kingApi.logSighting>().mockResolvedValue(event({ id: 'new-seen', kind: 'seen' })),
    undo: vi.fn<typeof kingApi.undo>().mockResolvedValue(undefined),
    renameEvent: vi.fn<typeof kingApi.renameEvent>().mockResolvedValue(undefined),
    getHeat: vi.fn<typeof kingApi.getHeat>().mockResolvedValue(heat),
    getHistory: vi.fn<typeof kingApi.getHistory>().mockResolvedValue(history),
  };
}
