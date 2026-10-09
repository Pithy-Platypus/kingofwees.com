import { fireEvent, screen } from '@testing-library/react';
import L from 'leaflet';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../test/render';
import { MapView } from './MapView';

const center = { latitude: 45.523, longitude: -122.677 };
const region = () => screen.getByRole('region', { name: 'Map of King’s street' });

afterEach(() => vi.restoreAllMocks());

describe('MapView', () => {
  it('when asked to fit, frames every marker, however far apart', () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds');
    const far = { latitude: 45.525, longitude: -122.679 };

    renderInEnglish(
      <MapView
        center={center}
        label="Map of King’s street"
        fit
        markers={[
          { point: center, kind: 'fed' },
          { point: far, kind: 'seen' },
        ]}
      />,
    );

    const bounds = fitBounds.mock.lastCall![0] as L.LatLngBounds;
    expect(bounds.contains([center.latitude, center.longitude])).toBe(true);
    expect(bounds.contains([far.latitude, far.longitude])).toBe(true);
  });

  it('leaves the view alone when not asked to fit, so a picking map doesn’t jump', () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds');

    renderInEnglish(<MapView center={center} label="Map of King’s street" markers={[{ point: center, kind: 'seen' }]} />);

    expect(fitBounds).not.toHaveBeenCalled();
  });

  it('draws heat cells bigger the busier their level, each tagged with its level', () => {
    const circleMarker = vi.spyOn(L, 'circleMarker');
    const next = { latitude: 45.524, longitude: -122.677 };

    renderInEnglish(
      <MapView
        center={center}
        label="Map of King’s street"
        markers={[
          { point: center, kind: 'heat', level: 4 },
          { point: next, kind: 'heat', level: 1 },
        ]}
      />,
    );

    expect(region().querySelectorAll('.map-marker-heat.map-heat-4')).toHaveLength(1);
    expect(region().querySelectorAll('.map-marker-heat.map-heat-1')).toHaveLength(1);
    const [busiest, quietest] = circleMarker.mock.calls.map(([, options]) => options!.radius!);
    expect(busiest).toBeGreaterThan(quietest);
  });

  it('is a labelled region that credits OpenStreetMap', () => {
    renderInEnglish(<MapView center={center} label="Map of King’s street" />);

    expect(region()).toHaveTextContent('OpenStreetMap');
  });

  it('labels its zoom buttons in the reader’s language', () => {
    renderInEnglish(<MapView center={center} label="Map of King’s street" />);

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
  });

  const pickingMap = (props: { instruction?: string; goTo?: { latitude: number; longitude: number } } = {}) => {
    const onPick = vi.fn();
    const spy = vi.spyOn(L, 'map');
    const view = renderInEnglish(
      <MapView center={center} label="Map of King’s street" instruction="Move the map so the pin is on him." onPick={onPick} {...props} />,
    );
    // The map Leaflet built, to move it as a person would.
    const map = spy.mock.results[0].value as L.Map;
    return { onPick, map, ...view };
  };

  it('shows no pin when nothing is to be picked', () => {
    renderInEnglish(<MapView center={center} label="Map of King’s street" />);

    expect(region().querySelector('.map-pin')).toBeNull();
  });

  it('shows a pin at the center, with the instruction describing the map', () => {
    pickingMap();

    expect(region().querySelector('.map-pin')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Map of King’s street', description: 'Move the map so the pin is on him.' })).toBeInTheDocument();
  });

  it('picks nothing until the map is moved', () => {
    const { onPick } = pickingMap();

    expect(onPick).not.toHaveBeenCalled();
  });

  it('picks the point under the pin whenever the map stops moving (drag, zoom or arrow keys)', () => {
    const { onPick, map } = pickingMap();
    const moved = { lat: 45.524, lng: -122.676 };

    map.setView(moved, map.getZoom(), { animate: false });

    expect(onPick).toHaveBeenLastCalledWith({ latitude: moved.lat, longitude: moved.lng });
  });

  it('a tap moves the map so the pin is on the tapped point, and picks it', () => {
    const { onPick, map } = pickingMap();
    const panTo = vi.spyOn(map, 'panTo');

    // Well off-center: a tap under a pixel from the pin doesn't move the map.
    fireEvent.click(region().querySelector('.leaflet-container')!, { clientX: 120, clientY: 80 });

    const tapped = panTo.mock.lastCall![0] as L.LatLng;
    expect(tapped.equals(L.latLng(center.latitude, center.longitude), 1e-6)).toBe(false);
    const picked = onPick.mock.lastCall![0];
    expect(picked.latitude).toBeCloseTo(tapped.lat, 6);
    expect(picked.longitude).toBeCloseTo(tapped.lng, 6);
  });

  it('moves to a place it is sent to, and picks it', () => {
    const elsewhere = { latitude: 45.52, longitude: -122.68 };
    const { onPick, map, rerender } = pickingMap();

    rerender(
      <MapView center={center} label="Map of King’s street" instruction="Move the map so the pin is on him." onPick={onPick} goTo={elsewhere} />,
    );

    expect(map.getCenter()).toEqual(L.latLng(elsewhere.latitude, elsewhere.longitude));
    expect(onPick).toHaveBeenLastCalledWith(elsewhere);
  });

  it('keeps its zoom buttons in the bottom corner, away from the pin', () => {
    pickingMap();

    expect(region().querySelector('.leaflet-bottom.leaflet-right .leaflet-control-zoom')).not.toBeNull();
  });

  it('draws a marker of each kind it is given, and redraws when they change', () => {
    const { rerender } = renderInEnglish(
      <MapView center={center} label="Map of King’s street" markers={[{ point: center, kind: 'seen' }]} />,
    );
    expect(region().querySelectorAll('.map-marker-seen')).toHaveLength(1);

    rerender(
      <MapView
        center={center}
        label="Map of King’s street"
        markers={[
          { point: center, kind: 'fed' },
          { point: center, kind: 'fed' },
        ]}
      />,
    );

    expect(region().querySelectorAll('.map-marker-seen')).toHaveLength(0);
    expect(region().querySelectorAll('.map-marker-fed')).toHaveLength(2);
  });
});
