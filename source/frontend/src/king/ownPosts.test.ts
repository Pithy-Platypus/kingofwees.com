import { describe, expect, it } from 'vitest';
import { blockedStorage, memoryStorage } from '../test/memoryStorage';
import { ownPosts } from './ownPosts';

const POSTED = '2026-10-08T12:00:00Z';
const after = (minutes: number, seconds = 0) => new Date(Date.parse(POSTED) + (minutes * 60 + seconds) * 1000);

describe('ownPosts', () => {
  it('can undo what this device posted for 10 minutes, as the server allows, and not after', () => {
    const own = ownPosts(memoryStorage());

    own.remember('e1', POSTED);

    expect(own.isUndoable('e1', after(0))).toBe(true);
    expect(own.isUndoable('e1', after(10))).toBe(true);
    expect(own.isUndoable('e1', after(10, 1))).toBe(false);
  });

  it('knows nothing of posts it never made', () => {
    const own = ownPosts(memoryStorage());
    own.remember('e1', POSTED);

    expect(own.isUndoable('someone-else', after(1))).toBe(false);
  });

  it('remembers across a reload of the page', () => {
    const storage = memoryStorage();
    ownPosts(storage).remember('e1', POSTED);

    expect(ownPosts(storage).isUndoable('e1', after(5))).toBe(true);
  });

  it('forgets only the post that was undone', () => {
    const own = ownPosts(memoryStorage());
    own.remember('e1', POSTED);
    own.remember('e2', POSTED);

    own.forget('e1');

    expect(own.isUndoable('e2', after(1))).toBe(true);
  });

  it('forgets a post once it is undone', () => {
    const storage = memoryStorage();
    const own = ownPosts(storage);
    own.remember('e1', POSTED);

    own.forget('e1');

    expect(own.isUndoable('e1', after(1))).toBe(false);
    expect(ownPosts(storage).isUndoable('e1', after(1))).toBe(false);
  });

  it('keeps only posts still inside the window', () => {
    const storage = memoryStorage();
    const own = ownPosts(storage);
    own.remember('old', POSTED);

    own.remember('recent', after(1).toISOString());
    own.remember('edge', after(5).toISOString());

    own.remember('new', after(11).toISOString());

    // "old" is 11 minutes before the newest, "recent" 10 (still undoable, as on the server), "edge" 6.
    expect(JSON.parse(storage.getItem('kingofwees.ownPosts')!).map((p: { id: string }) => p.id)).toEqual(['recent', 'edge', 'new']);
  });

  it('works for the open page when storage is blocked', () => {
    const own = ownPosts(blockedStorage);

    own.remember('e1', POSTED);

    expect(own.isUndoable('e1', after(1))).toBe(true);
  });

  it('starts empty when what is stored is unreadable', () => {
    const storage = memoryStorage();
    storage.setItem('kingofwees.ownPosts', 'not json');

    expect(ownPosts(storage).isUndoable('e1', after(1))).toBe(false);
  });
});
