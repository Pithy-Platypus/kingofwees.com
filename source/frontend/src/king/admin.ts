import { ApiError, request, type KingEventView } from './api';
import type { KeyValueStorage } from './reporter';

const ADMIN_KEY_KEY = 'kingofwees.adminKey';

/** What hiding a device would cover, or did: never its key. `reporterName` is the name on its newest entry. */
export type DeviceView = { entries: number; spots: number; reporterName: string | null; newestAt: string | null };
/** `id` is the hidden-device record's own id, used to restore it. */
export type HiddenDevice = DeviceView & { id: string; hiddenAt: string };

// The key goes in a header, never a URL, so it stays out of logs and browser history.
const as = (key: string, method?: 'POST' | 'DELETE'): RequestInit => ({
  ...(method ? { method } : {}),
  headers: { Authorization: `Bearer ${key}` },
});
const event = (id: string) => `/api/admin/events/${encodeURIComponent(id)}`;

export const adminApi = {
  check: (key: string) => request<void>('/api/admin/check', as(key)),
  hideEntry: (key: string, id: string) => request<void>(`${event(id)}/hide`, as(key, 'POST')),
  unhideEntry: (key: string, id: string) => request<void>(`${event(id)}/hide`, as(key, 'DELETE')),
  describeDevice: (key: string, id: string) => request<DeviceView>(`${event(id)}/device`, as(key)),
  hideDevice: (key: string, id: string) => request<HiddenDevice>(`${event(id)}/hide-device`, as(key, 'POST')),
  hiddenEntries: (key: string) => request<KingEventView[]>('/api/admin/hidden-entries', as(key)),
  hiddenDevices: (key: string) => request<HiddenDevice[]>('/api/admin/hidden', as(key)),
  restoreDevice: (key: string, id: string) =>
    request<void>(`/api/admin/hidden/${encodeURIComponent(id)}`, as(key, 'DELETE')),
};
export type AdminApi = typeof adminApi;
/** An accepted key on this device; `onRejected` drops it when the server stops accepting it (rotated). */
export type AdminSession = { key: string; api: AdminApi; onRejected: () => void };

export function loadAdminKey(storage: KeyValueStorage | undefined): string | null {
  try {
    return storage?.getItem(ADMIN_KEY_KEY) || null;
  } catch {
    return null; // Storage blocked: enter the key again next visit.
  }
}

/** null forgets it (sign out, or a key the server no longer accepts). */
export function saveAdminKey(storage: KeyValueStorage | undefined, key: string | null): void {
  try {
    storage?.setItem(ADMIN_KEY_KEY, key ?? '');
  } catch {
    // Storage blocked; the key works until the page closes.
  }
}

// The server's setting is 64 hex characters; a key from the tool is 43 URL-safe Base64 ones. Easy to swap by mistake.
export const looksLikeKeyHash = (text: string) => /^[0-9a-f]{64}$/i.test(text.trim());

export const isKeyRejected = (error: unknown) => error instanceof ApiError && error.status === 401;
