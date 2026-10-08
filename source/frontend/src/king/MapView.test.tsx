import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    renderInEnglish(<MapView center={center} label="Map of King’s street" markers={[{ point: center, kind: 'picked' }]} />);

    expect(fitBounds).not.toHaveBeenCalled();
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

  it('offers no picking when nothing is to be picked', () => {
    renderInEnglish(<MapView center={center} label="Map of King’s street" />);

    expect(screen.queryByRole('button', { name: 'Use map center' })).not.toBeInTheDocument();
  });

  it('picks the center with a button, for people who can’t tap a map', async () => {
    const onPick = vi.fn();
    renderInEnglish(<MapView center={center} label="Map of King’s street" onPick={onPick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Use map center' }));

    expect(onPick).toHaveBeenCalledWith(center);
  });

  it('picks the tapped point', () => {
    const onPick = vi.fn();
    renderInEnglish(<MapView center={center} label="Map of King’s street" onPick={onPick} />);

    fireEvent.click(region().querySelector('.leaflet-container')!);

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0][0]).toEqual({ latitude: expect.any(Number), longitude: expect.any(Number) });
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
          { point: center, kind: 'picked' },
        ]}
      />,
    );

    expect(region().querySelectorAll('.map-marker-seen')).toHaveLength(0);
    expect(region().querySelectorAll('.map-marker-fed')).toHaveLength(1);
    expect(region().querySelectorAll('.map-marker-picked')).toHaveLength(1);
  });
});
