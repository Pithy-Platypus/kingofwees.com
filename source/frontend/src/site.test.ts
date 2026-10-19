import { describe, expect, it } from 'vitest';
import { sourceUrlFor } from './site';

describe('sourceUrlFor', () => {
  it('links to the commit a version names', () => {
    expect(sourceUrlFor('2026.10.19+f7548a2a81ff')).toBe('https://github.com/Pithy-Platypus/kingofwees.com/tree/f7548a2a81ff');
  });

  it('leaves out the mark of a build with uncommitted changes', () => {
    expect(sourceUrlFor('2026.1.9+0fbce978816b.dirty')).toBe('https://github.com/Pithy-Platypus/kingofwees.com/tree/0fbce978816b');
  });
});
