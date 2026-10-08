const STORAGE_KEY = 'kingofwees.reporterKey';

// A random per-device key that lets this device undo its own entries. Storage can be blocked (private mode),
// in which case the key lives only for this page load.
export function getReporterKey(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): string {
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
