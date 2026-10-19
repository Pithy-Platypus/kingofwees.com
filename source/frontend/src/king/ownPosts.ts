import type { KeyValueStorage } from './reporter';

const OWN_POSTS_KEY = 'kingofwees.ownPosts';
/** The server's undo window (KingEndpoints.UndoWindow): this device may undo its own post for this long. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

type OwnPost = { id: string; at: string };

/** This device's entries and shared photos of the last 10 minutes, so the page can offer Undo on them. */
export type OwnPosts = {
  /** `at` is the server's time for the post (occurredAt, postedAt). */
  remember: (id: string, at: string) => void;
  forget: (id: string) => void;
  isUndoable: (id: string, now: Date) => boolean;
};

/** The server never says whose a post is, so the browser remembers its own; the server still checks the device key. */
export type OwnUndo = {
  canUndo: (id: string) => boolean;
  remember: (id: string, at: string) => void;
  undoEntry: (id: string) => Promise<void>;
  removePhoto: (id: string) => Promise<void>;
};

function load(storage: KeyValueStorage | undefined): OwnPost[] {
  try {
    const stored: unknown = JSON.parse(storage?.getItem(OWN_POSTS_KEY) ?? '[]');
    return Array.isArray(stored) ? (stored as OwnPost[]) : [];
  } catch {
    return []; // Blocked or unreadable: nothing to undo from earlier visits.
  }
}

// Kept in memory as well, so it still works for the open page when storage is blocked (like the device key).
export function ownPosts(storage: KeyValueStorage | undefined): OwnPosts {
  let posts = load(storage);
  const save = () => {
    try {
      storage?.setItem(OWN_POSTS_KEY, JSON.stringify(posts));
    } catch {
      // Storage blocked; Undo is offered until the page closes.
    }
  };
  const elapsed = (post: OwnPost, now: number) => now - Date.parse(post.at);

  return {
    // Posts the server would no longer undo are dropped, judged by the server's own time for the newest one.
    remember: (id, at) => {
      posts = [...posts.filter((p) => elapsed(p, Date.parse(at)) <= UNDO_WINDOW_MS), { id, at }];
      save();
    },
    forget: (id) => {
      posts = posts.filter((p) => p.id !== id);
      save();
    },
    isUndoable: (id, now) => posts.some((p) => p.id === id && elapsed(p, now.getTime()) <= UNDO_WINDOW_MS),
  };
}
