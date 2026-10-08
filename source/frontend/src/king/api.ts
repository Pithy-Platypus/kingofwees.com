export type Food = 'wet' | 'dry' | 'treats';
export type KingEventView = {
  id: string;
  kind: 'fed' | 'seen';
  occurredAt: string;
  reporterName: string | null;
  foods: Food[];
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
  logFeeding: (body: Reporter & { foods: Food[] }) => postJson<KingEventView>('/api/king/feedings', body),
  logSighting: (body: Reporter) => postJson<KingEventView>('/api/king/sightings', body),
  undo: (id: string, reporterKey: string) =>
    request<void>(`/api/king/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Reporter-Key': reporterKey },
    }),
};
