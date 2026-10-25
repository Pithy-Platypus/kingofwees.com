import { describe, expect, it } from 'vitest';
import { photoIdFromPath, photoPath, routeFromPath } from './routes';

describe('a photo’s address', () => {
  it('is the photos page with the encoded id, and reads back', () => {
    expect(photoPath('a/b')).toBe('/photos/a%2Fb');
    expect(photoIdFromPath('/photos/a%2Fb')).toBe('a/b');
    expect(routeFromPath('/photos/p1')).toBe('photos');
  });

  it.each(['/photos', '/photos/', '/photos/p1/x', '/x/photos/p1', '/history', '/'])('%s names no photo', (pathname) => {
    expect(photoIdFromPath(pathname)).toBeNull();
  });

  it('leaves the other pages as they were', () => {
    expect(routeFromPath('/photos')).toBe('photos');
    expect(routeFromPath('/history')).toBe('history');
    expect(routeFromPath('/nope')).toBe('home');
  });
});
