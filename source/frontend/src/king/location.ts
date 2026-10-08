export type GeoPoint = { latitude: number; longitude: number };

// Location privacy: 3 decimals (~110 m, about a block). Why → docs/patterns/location-privacy.md.
const SCALE = 10 ** 3;

// Away from zero at midpoints, like the server's GeoPoint (Math.round alone rounds -0.5 up, toward zero).
const round = (coordinate: number) => (Math.sign(coordinate) * Math.round(Math.abs(coordinate) * SCALE)) / SCALE;

/** Every coordinate passes through here before it leaves the browser. */
export function roundToBlock({ latitude, longitude }: GeoPoint): GeoPoint {
  return { latitude: round(latitude), longitude: round(longitude) };
}

export type Geolocator = Pick<Geolocation, 'getCurrentPosition'>;

// A coarse, recent fix is plenty: it is rounded to ~a block before it is sent anyway.
const POSITION_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 };

/** Where the device is now (unrounded — kingApi rounds before sending). Rejects if refused or unavailable. */
export function currentPosition(geolocation: Geolocator | undefined): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      reject,
      POSITION_OPTIONS,
    );
  });
}

// "About a block": two rounded points one grid step apart diagonally are ~136 m apart.
const NEAR_METERS = 150;
const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Flat-earth distance: plenty accurate over a few blocks.
function metersBetween(a: GeoPoint, b: GeoPoint): number {
  const x = toRadians(b.longitude - a.longitude) * Math.cos(toRadians((a.latitude + b.latitude) / 2));
  const y = toRadians(b.latitude - a.latitude);
  return Math.hypot(x, y) * EARTH_RADIUS_METERS;
}

/** The closest saved spot within about a block of a point, or null. */
export function nearestSpot<S extends { location: GeoPoint }>(point: GeoPoint, spots: S[]): S | null {
  let nearest: S | null = null;
  let nearestMeters = NEAR_METERS;
  for (const spot of spots) {
    const meters = metersBetween(point, spot.location);
    if (meters <= nearestMeters) {
      nearest = spot;
      nearestMeters = meters;
    }
  }
  return nearest;
}
