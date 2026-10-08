import { describe, expect, it } from 'vitest';
import { describeCell, heatLevel, mergeNearSpots } from './heat';

describe('heatLevel', () => {
  it.each([
    [100, 100, 4],
    [76, 100, 4],
    [75, 100, 3],
    [51, 100, 3],
    [50, 100, 2],
    [26, 100, 2],
    [25, 100, 1],
    [1, 100, 1],
    [1, 1, 4],
  ])('puts %i of a busiest %i at level %i', (count, max, level) => {
    expect(heatLevel(count, max)).toBe(level);
  });
});

describe('describeCell', () => {
  const porch = { id: 'porch', name: 'Porch', location: { latitude: 45.523, longitude: -122.677 } };
  const corner = { id: 'corner', name: 'Corner', location: { latitude: 45.523, longitude: -122.667 } };

  it('uses the spot’s own name for a feeding spot', () => {
    const cell = { location: porch.location, count: 3, spotName: 'Porch' };

    expect(describeCell(cell, [])).toEqual({ kind: 'spot', name: 'Porch' });
  });

  it('is near a spot within about a block', () => {
    const cell = { location: { latitude: 45.524, longitude: -122.678 }, count: 1, spotName: null };

    expect(describeCell(cell, [corner, porch])).toEqual({ kind: 'near', name: 'Porch' });
  });

  it('is a distance in feet, to the nearest 50, from the closest spot when none is near', () => {
    // 0.00315° of latitude is about 350 m, or 1,149 ft.
    const cell = { location: { latitude: 45.52615, longitude: -122.677 }, count: 1, spotName: null };

    expect(describeCell(cell, [corner, porch])).toEqual({ kind: 'from', name: 'Porch', distance: { value: 1150, unit: 'foot' } });
  });

  it('switches to miles, to a tenth, from a quarter mile out', () => {
    // 0.005° of latitude is about 556 m, or 0.35 mi.
    const cell = { location: { latitude: 45.528, longitude: -122.677 }, count: 1, spotName: null };

    expect(describeCell(cell, [corner, porch])).toEqual({ kind: 'from', name: 'Porch', distance: { value: 0.3, unit: 'mile' } });
  });

  it('keeps feet just inside a quarter mile', () => {
    // 0.0035° of latitude is about 389 m, or 1,277 ft.
    const cell = { location: { latitude: 45.5265, longitude: -122.677 }, count: 1, spotName: null };

    expect(describeCell(cell, [porch])).toEqual({ kind: 'from', name: 'Porch', distance: { value: 1300, unit: 'foot' } });
  });

  it('is nowhere in particular when there are no spots', () => {
    const cell = { location: porch.location, count: 1, spotName: null };

    expect(describeCell(cell, [])).toEqual({ kind: 'nowhere' });
  });
});

describe('mergeNearSpots', () => {
  const porch = { id: 'porch', name: 'Porch', location: { latitude: 45.523, longitude: -122.677 } };
  const far = { location: { latitude: 45.53, longitude: -122.677 }, count: 2, spotName: null };

  it('folds every block near a spot into one place at the spot, busiest first', () => {
    const cells = [
      far,
      { location: { latitude: 45.524, longitude: -122.677 }, count: 2, spotName: null },
      { location: { latitude: 45.523, longitude: -122.678 }, count: 1, spotName: null },
    ];

    expect(mergeNearSpots(cells, [porch])).toEqual([{ location: porch.location, count: 3, spotName: null }, far]);
  });

  it('leaves feeding spots and blocks with no spot near as they are', () => {
    const fed = { location: porch.location, count: 4, spotName: 'Porch' };

    expect(mergeNearSpots([fed, far], [porch])).toEqual([fed, far]);
  });
});
