import { ApiError, request, type KingEventView } from './api';
import type { KeyValueStorage } from './reporter';

const ADMIN_KEY_KEY = 'kingofwees.adminKey';
const ADMIN_NAME_KEY = 'kingofwees.adminName';

/** What hiding a device would cover, or did: never its key. `reporterName` is the name on its newest entry. */
export type DeviceView = { entries: number; spots: number; reporterName: string | null; newestAt: string | null };
/** `id` is the hidden-device record's own id, used to restore it. */
export type HiddenDevice = DeviceView & { id: string; hiddenAt: string };
/**
 * Every place, for renaming and merging; `hiddenPoster` marks one whose poster is hidden (it isn't in the public list),
 * `feedings` counts every feeding there, hidden ones too (they all move in a merge).
 */
export type AdminSpot = { id: string; name: string; hiddenPoster: boolean; feedings: number };
export type AdminAction =
  | 'signIn'
  | 'signInFailed'
  | 'hideEntry'
  | 'showEntry'
  | 'hidePoster'
  | 'restorePoster'
  | 'renamePlace'
  | 'mergePlaces';
/** What an action touched, in words: names and counts, never a device key. */
export type AdminTouched = {
  posterName: string | null;
  entries: number | null;
  spots: number | null;
  entryKind: KingEventView['kind'] | null;
  entryAt: string | null;
  placeName: string | null;
  newName: string | null;
  mergedNames: string[] | null;
  feedings: number | null;
};
/** One line of the audit log; `adminName` is what was typed at sign-in, `address` the one the rate limits use. */
export type ActivityRecord = {
  id: string;
  at: string;
  action: AdminAction;
  adminName: string | null;
  address: string | null;
  touched: AdminTouched;
};
export type ActivityPage = { records: ActivityRecord[]; next: string | null };
/** Who is signed in on this device: the key, and the name they typed (with one shared key, a claim — not proof). */
export type AdminSignIn = { key: string; name: string };

// The key goes in a header, never a URL, so it stays out of logs and browser history. Header values must be
// ASCII, so the name travels URL-encoded; no name, no header (the server records "no name").
const headers = (who: AdminSignIn): Record<string, string> => ({
  Authorization: `Bearer ${who.key}`,
  ...(who.name ? { 'X-Admin-Name': encodeURIComponent(who.name) } : {}),
});
const as = (who: AdminSignIn, method?: 'POST' | 'DELETE'): RequestInit => ({
  ...(method ? { method } : {}),
  headers: headers(who),
});
const event = (id: string) => `/api/admin/events/${encodeURIComponent(id)}`;

export const adminApi = {
  check: (who: AdminSignIn) => request<void>('/api/admin/check', as(who)),
  hideEntry: (who: AdminSignIn, id: string) => request<void>(`${event(id)}/hide`, as(who, 'POST')),
  unhideEntry: (who: AdminSignIn, id: string) => request<void>(`${event(id)}/hide`, as(who, 'DELETE')),
  describeDevice: (who: AdminSignIn, id: string) => request<DeviceView>(`${event(id)}/device`, as(who)),
  hideDevice: (who: AdminSignIn, id: string) => request<HiddenDevice>(`${event(id)}/hide-device`, as(who, 'POST')),
  hiddenEntries: (who: AdminSignIn) => request<KingEventView[]>('/api/admin/hidden-entries', as(who)),
  hiddenDevices: (who: AdminSignIn) => request<HiddenDevice[]>('/api/admin/hidden', as(who)),
  restoreDevice: (who: AdminSignIn, id: string) =>
    request<void>(`/api/admin/hidden/${encodeURIComponent(id)}`, as(who, 'DELETE')),
  listSpots: (who: AdminSignIn) => request<AdminSpot[]>('/api/admin/spots', as(who)),
  activity: (who: AdminSignIn, before?: string) =>
    request<ActivityPage>(`/api/admin/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`, as(who)),
  renameSpot: (who: AdminSignIn, spotId: string, name: string) =>
    request<void>('/api/admin/spots/rename', {
      method: 'POST',
      headers: { ...headers(who), 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotId, name }),
    }),
  mergeSpots: (who: AdminSignIn, keepId: string, mergeIds: string[], name?: string) =>
    request<void>('/api/admin/spots/merge', {
      method: 'POST',
      headers: { ...headers(who), 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, mergeIds, name: name ?? null }),
    }),
};
export type AdminApi = typeof adminApi;
/** An accepted sign-in on this device; `onRejected` drops it when the server stops accepting the key (rotated). */
export type AdminSession = { signIn: AdminSignIn; api: AdminApi; onRejected: () => void };

export function loadAdminSignIn(storage: KeyValueStorage | undefined): AdminSignIn | null {
  try {
    const key = storage?.getItem(ADMIN_KEY_KEY);
    return key ? { key, name: storage?.getItem(ADMIN_NAME_KEY) ?? '' } : null;
  } catch {
    return null; // Storage blocked: sign in again next visit.
  }
}

/** null forgets it (sign out, or a key the server no longer accepts). */
export function saveAdminSignIn(storage: KeyValueStorage | undefined, signIn: AdminSignIn | null): void {
  try {
    storage?.setItem(ADMIN_KEY_KEY, signIn?.key ?? '');
    storage?.setItem(ADMIN_NAME_KEY, signIn?.name ?? '');
  } catch {
    // Storage blocked; the sign-in works until the page closes.
  }
}

// The server's setting is 64 hex characters; a key from the tool is 43 URL-safe Base64 ones. Easy to swap by mistake.
export const looksLikeKeyHash = (text: string) => /^[0-9a-f]{64}$/i.test(text.trim());

export const isKeyRejected = (error: unknown) => error instanceof ApiError && error.status === 401;
