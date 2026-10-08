const STORAGE_KEY = 'kingofwees.reporterKey';
const NICKNAME_KEY = 'kingofwees.nickname';
const LAST_SPOT_KEY = 'kingofwees.lastSpotId';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

// A random per-device key that lets this device undo its own entries. Storage can be blocked (private mode),
// in which case the key lives only for this page load.
export function getReporterKey(storage: KeyValueStorage | undefined): string {
  try {
    const existing = storage?.getItem(STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // Storage blocked; fall through to a fresh key.
  }
  const key = crypto.randomUUID();
  try {
    storage?.setItem(STORAGE_KEY, key);
  } catch {
    // Storage blocked; the key still works for this session.
  }
  return key;
}

/** The name shown with this device's entries: null when never asked, '' when skipped. */
export function loadNickname(storage: KeyValueStorage | undefined): string | null {
  try {
    return storage?.getItem(NICKNAME_KEY) ?? null;
  } catch {
    return null; // Storage blocked: ask again next visit; App keeps the answer for this one.
  }
}

export function saveNickname(storage: KeyValueStorage | undefined, name: string): void {
  try {
    storage?.setItem(NICKNAME_KEY, name.trim());
  } catch {
    // Storage blocked; the name still applies until the page closes.
  }
}

/** The spot this device last fed King at, preselected next time; null if none. */
export function loadLastSpotId(storage: KeyValueStorage | undefined): string | null {
  try {
    return storage?.getItem(LAST_SPOT_KEY) || null;
  } catch {
    return null;
  }
}

export function saveLastSpotId(storage: KeyValueStorage | undefined, spotId: string | null): void {
  try {
    storage?.setItem(LAST_SPOT_KEY, spotId ?? '');
  } catch {
    // Storage blocked; nothing is preselected next visit.
  }
}
