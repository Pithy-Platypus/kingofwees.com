import { vi } from 'vitest';
import type { KingEventView, KingStatus, kingApi } from '../king/api';

export const at = (iso: string) => new Date(iso);
export const NOW = at('2026-10-08T12:00:00Z');

export const event = (overrides: Partial<KingEventView>): KingEventView => ({
  id: 'e1',
  kind: 'fed',
  occurredAt: NOW.toISOString(),
  reporterName: null,
  foods: [],
  ...overrides,
});

export const emptyStatus: KingStatus = { lastFed: null, lastSeen: null, recent: [] };

export function fakeApi(status: KingStatus = emptyStatus) {
  return {
    getStatus: vi.fn<typeof kingApi.getStatus>().mockResolvedValue(status),
    logFeeding: vi.fn<typeof kingApi.logFeeding>().mockImplementation(async (r) =>
      event({ id: 'new-fed', kind: 'fed', foods: r.foods }),
    ),
    logSighting: vi.fn<typeof kingApi.logSighting>().mockResolvedValue(event({ id: 'new-seen', kind: 'seen' })),
    undo: vi.fn<typeof kingApi.undo>().mockResolvedValue(undefined),
  };
}
