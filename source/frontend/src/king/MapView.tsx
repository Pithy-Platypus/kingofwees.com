import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useId, useRef } from 'react';
import { defineMessages, useIntl, type NoMessageValues } from 'react-intl';
import type { HeatLevel } from './heat';
import { PinIcon } from './icons';
import type { GeoPoint } from './location';

type Values = { attribution: { osm: string }; zoomIn: NoMessageValues; zoomOut: NoMessageValues };

const m = defineMessages<Values>({
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

export type MapMarker = { point: GeoPoint; kind: 'fed' | 'seen' } | { point: GeoPoint; kind: 'heat'; level: HeatLevel };

type Props = {
  center: GeoPoint;
  label: string;
  markers?: MapMarker[];
  /**
   * Makes this a picking map: a pin sits at the center and the person moves the map under it (drag, zoom, arrow
   * keys, or a tap, which centers the map there). Called with the point under the pin each time the map stops moving.
   */
  onPick?: (point: GeoPoint) => void;
  /** Tells a picking map how to place its pin; shown above the map and read as its description. */
  instruction?: string;
  /** Moves a picking map here (e.g. to the device's location), which picks it like any other move. */
  goTo?: GeoPoint | null;
  /** Keep every marker in view as they change (the home map); picking maps leave the view to the person. */
  fit?: boolean;
  className?: string;
};

// Heat cells grow with their level; every other marker is one size.
const MARKER_RADIUS = 10;
const HEAT_RADIUS: Record<HeatLevel, number> = { 1: 8, 2: 12, 3: 16, 4: 20 };

const markerStyle = (marker: MapMarker): L.CircleMarkerOptions =>
  marker.kind === 'heat'
    ? { radius: HEAT_RADIUS[marker.level], className: `map-marker map-marker-heat map-heat-${marker.level}` }
    : { radius: MARKER_RADIUS, className: `map-marker map-marker-${marker.kind}` };

const toPoint = ({ lat, lng }: L.LatLng): GeoPoint => ({ latitude: lat, longitude: lng });

// Leaflet used directly (no react-leaflet): React owns the container, Leaflet everything inside it.
export function MapView({ center, label, markers = [], onPick, instruction, goTo, fit = false, className = '' }: Props) {
  const intl = useIntl();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick);
  const instructionId = useId();
  const attribution = intl.formatMessage(m.attribution, { osm: OSM_LINK });
  const zoomInTitle = intl.formatMessage(m.zoomIn);
  const zoomOutTitle = intl.formatMessage(m.zoomOut);

  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  // The map is built once per mount; the first center is where it opens, and panning is the person's business.
  useEffect(() => {
    const created = L.map(container.current!, { center: [center.latitude, center.longitude], zoom: ZOOM, zoomControl: false });
    // Bottom right, so a "+" by the pin isn't taken for it.
    L.control.zoom({ position: 'bottomright', zoomInTitle, zoomOutTitle }).addTo(created);
    L.tileLayer(TILES, { maxZoom: 19, attribution }).addTo(created);
    markerLayer.current = L.layerGroup().addTo(created);
    // Registered after the first view is set, so only a move picks: an untouched map has picked nothing.
    created.on('moveend', () => pick.current?.(toPoint(created.getCenter())));
    created.on('click', (e: L.LeafletMouseEvent) => {
      if (pick.current) created.panTo(e.latlng);
    });
    map.current = created;
    return () => {
      created.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recreating the map on every prop change would reset the view
  }, []);

  useEffect(() => {
    if (goTo) map.current!.setView([goTo.latitude, goTo.longitude], map.current!.getZoom(), { animate: false });
  }, [goTo]);

  useEffect(() => {
    const layer = markerLayer.current!;
    layer.clearLayers();
    for (const marker of markers) {
      L.circleMarker([marker.point.latitude, marker.point.longitude], markerStyle(marker)).addTo(layer);
    }
    if (fit && markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(({ point }) => [point.latitude, point.longitude]));
      // Never closer than street level, so one marker (or two close together) isn't blown up.
      map.current!.fitBounds(bounds, { padding: [24, 24], maxZoom: ZOOM, animate: false });
    }
  }, [markers, fit]);

  return (
    <div className={`map-block ${className}`}>
      {instruction && (
        <p id={instructionId} className="map-instruction">
          {instruction}
        </p>
      )}
      <div role="region" aria-label={label} aria-describedby={instruction ? instructionId : undefined} className="map-frame">
        <div ref={container} className="map-canvas" />
        {onPick && <PinIcon className="map-pin" />}
      </div>
    </div>
  );
}
