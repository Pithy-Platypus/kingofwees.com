import { lazy, Suspense } from 'react';
import type { MapViewProps } from './MapView';

// Leaflet is ~150 kB, close to a third of the visitor bundle, and many visits never show a map: it loads the first
// time a map does. Import MapView from here, never from './MapView' (lint enforces it).
const Loaded = lazy(() => import('./MapView').then((module) => ({ default: module.MapView })));

/** The map, loaded on first use; until then an empty frame of the same size, so nothing below it jumps. */
export function MapView(props: MapViewProps) {
  return (
    <Suspense
      fallback={
        <div className={`map-block ${props.className ?? ''}`}>
          <div className="map-frame">
            <div className="map-canvas" />
          </div>
        </div>
      }
    >
      <Loaded {...props} />
    </Suspense>
  );
}
