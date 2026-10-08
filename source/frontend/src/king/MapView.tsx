import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { defineMessages, FormattedMessage, useIntl, type NoMessageValues } from 'react-intl';
import type { GeoPoint } from './location';

type Values = { useCenter: NoMessageValues; attribution: { osm: string }; zoomIn: NoMessageValues; zoomOut: NoMessageValues };

const m = defineMessages<Values>({
  useCenter: {
    id: 'map.useCenter',
    defaultMessage: 'Use map center',
    description: 'Picks the point under the cross in the middle of the map; the keyboard alternative to tapping it',
  },
  attribution: {
    id: 'map.attribution',
    defaultMessage: '© {osm} contributors',
    description: 'Required map data credit; {osm} is the “OpenStreetMap” link',
  },
  zoomIn: { id: 'map.zoomIn', defaultMessage: 'Zoom in', description: 'Map button' },
  zoomOut: { id: 'map.zoomOut', defaultMessage: 'Zoom out', description: 'Map button' },
});

// Street level: a block or two fills a phone screen.
const ZOOM = 17;
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_LINK = '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type MapMarker = { point: GeoPoint; kind: 'fed' | 'seen' | 'picked' };

type Props = {
  center: GeoPoint;
  label: string;
  markers?: MapMarker[];
  onPick?: (point: GeoPoint) => void;
  /** Keep every marker in view as they change (the home map); picking maps leave the view to the person. */
  fit?: boolean;
  className?: string;
};

const toPoint = ({ lat, lng }: L.LatLng): GeoPoint => ({ latitude: lat, longitude: lng });

// Leaflet used directly (no react-leaflet): React owns the container, Leaflet everything inside it.
export function MapView({ center, label, markers = [], onPick, fit = false, className = '' }: Props) {
  const intl = useIntl();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick);
  const attribution = intl.formatMessage(m.attribution, { osm: OSM_LINK });
  const zoomInTitle = intl.formatMessage(m.zoomIn);
  const zoomOutTitle = intl.formatMessage(m.zoomOut);

  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  // The map is built once per mount; the first center is where it opens, and panning is the person's business.
  useEffect(() => {
    const created = L.map(container.current!, { center: [center.latitude, center.longitude], zoom: ZOOM, zoomControl: false });
    L.control.zoom({ zoomInTitle, zoomOutTitle }).addTo(created);
    L.tileLayer(TILES, { maxZoom: 19, attribution }).addTo(created);
    markerLayer.current = L.layerGroup().addTo(created);
    created.on('click', (e: L.LeafletMouseEvent) => pick.current?.(toPoint(e.latlng)));
    map.current = created;
    return () => {
      created.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recreating the map on every prop change would reset the view
  }, []);

  useEffect(() => {
    const layer = markerLayer.current!;
    layer.clearLayers();
    for (const { point, kind } of markers) {
      L.circleMarker([point.latitude, point.longitude], { radius: 10, className: `map-marker map-marker-${kind}` }).addTo(layer);
    }
    if (fit && markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(({ point }) => [point.latitude, point.longitude]));
      // Never closer than street level, so one marker (or two close together) isn't blown up.
      map.current!.fitBounds(bounds, { padding: [24, 24], maxZoom: ZOOM, animate: false });
    }
  }, [markers, fit]);

  return (
    <div className={`map-block ${className}`}>
      <div role="region" aria-label={label} className={onPick ? 'map-frame map-frame-picking' : 'map-frame'}>
        <div ref={container} className="map-canvas" />
      </div>
      {onPick && (
        <button type="button" className="map-center-button" onClick={() => onPick(toPoint(map.current!.getCenter()))}>
          <FormattedMessage {...m.useCenter} />
        </button>
      )}
    </div>
  );
}
