import type { GeoPoint } from '../king/location';

// Stands in for navigator.geolocation: answers with a fix, or refuses (permission denied, no signal).
export function fakeGeolocation(answer: GeoPoint | 'denied') {
  const getCurrentPosition = (success: PositionCallback, failure?: PositionErrorCallback | null) => {
    if (answer === 'denied') {
      failure?.({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError);
    } else {
      success({ coords: { latitude: answer.latitude, longitude: answer.longitude } } as GeolocationPosition);
    }
  };
  return { getCurrentPosition };
}
