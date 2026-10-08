import { describe, expect, it, vi } from 'vitest';
import { fakeGeolocation } from '../test/fakeGeolocation';
import { closestSpot, currentPosition, nearestSpot, roundToBlock } from './location';

describe('roundToBlock', () => {
  it.each([
    [45.523456, -122.676543, 45.523, -122.677],
    [45.5235, -122.6765, 45.524, -122.677],
    [-33.86882, 151.20929, -33.869, 151.209],
  ])('rounds (%f, %f) to (%f, %f), like the server', (latitude, longitude, expectedLatitude, expectedLongitude) => {
    expect(roundToBlock({ latitude, longitude })).toEqual({ latitude: expectedLatitude, longitude: expectedLongitude });
  });

  it('sends a tiny offset from zero as plain zero', () => {
    const point = roundToBlock({ latitude: 0.0004, longitude: -0.0004 });

    expect(JSON.stringify(point)).toBe('{"latitude":0,"longitude":0}');
  });

  it('keeps nothing finer than three decimals, whatever the GPS reports', () => {
    const { latitude, longitude } = roundToBlock({ latitude: 45.52345678901, longitude: -122.67654321098 });

    expect(String(latitude).split('.')[1].length).toBeLessThanOrEqual(3);
    expect(String(longitude).split('.')[1].length).toBeLessThanOrEqual(3);
  });
});

describe('currentPosition', () => {
  it('answers with where the device is', async () => {
    await expect(currentPosition(fakeGeolocation({ latitude: 45.523456, longitude: -122.676543 }))).resolves.toEqual({
      latitude: 45.523456,
      longitude: -122.676543,
    });
  });

  it('fails when the person says no or there is no fix', async () => {
    await expect(currentPosition(fakeGeolocation('denied'))).rejects.toBeDefined();
  });

  it('asks for a coarse fix and gives up after a while, so “I’m near him now” never hangs', async () => {
    const geolocation = { getCurrentPosition: vi.fn() };

    void currentPosition(geolocation);

    expect(geolocation.getCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: false,
      timeout: expect.any(Number),
    });
  });

  it('fails when the browser has no location at all', async () => {
    await expect(currentPosition(undefined)).rejects.toBeDefined();
  });
});

describe('nearestSpot', () => {
  const steps = { id: 'steps', name: 'Blue house steps', location: { latitude: 45.523, longitude: -122.677 } };
  const corner = { id: 'corner', name: 'Corner', location: { latitude: 45.523, longitude: -122.674 } };

  it('is the spot at the very same rounded place', () => {
    expect(nearestSpot({ latitude: 45.523, longitude: -122.677 }, [corner, steps])).toBe(steps);
  });

  it('counts the next block over, diagonally, as near', () => {
    expect(nearestSpot({ latitude: 45.524, longitude: -122.678 }, [steps])).toBe(steps);
  });

  it('is nothing two blocks away', () => {
    expect(nearestSpot({ latitude: 45.525, longitude: -122.677 }, [steps])).toBeNull();
    expect(nearestSpot({ latitude: 45.523, longitude: -122.680 }, [steps])).toBeNull();
  });

  it('picks the closer of two near spots', () => {
    expect(nearestSpot({ latitude: 45.523, longitude: -122.675 }, [steps, corner])).toBe(corner);
  });

  it('is nothing when there are no spots', () => {
    expect(nearestSpot({ latitude: 45.523, longitude: -122.677 }, [])).toBeNull();
  });
});

describe('closestSpot', () => {
  const steps = { id: 'steps', name: 'Blue house steps', location: { latitude: 45.523, longitude: -122.677 } };
  const corner = { id: 'corner', name: 'Corner', location: { latitude: 45.523, longitude: -122.667 } };

  it('is the closest spot however far, with its distance', () => {
    const closest = closestSpot({ latitude: 45.523, longitude: -122.673 }, [corner, steps]);

    expect(closest?.spot).toBe(steps);
    expect(closest?.meters).toBeCloseTo(312, 0);
  });

  it('is nothing when there are no spots', () => {
    expect(closestSpot({ latitude: 45.523, longitude: -122.677 }, [])).toBeNull();
  });
});
