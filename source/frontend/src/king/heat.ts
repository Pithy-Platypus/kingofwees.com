import type { SpotView } from './api';
import { closestSpot, nearestSpot, type GeoPoint } from './location';

export type HeatLevel = 1 | 2 | 3 | 4;
export type Cell = { location: GeoPoint; count: number; spotName: string | null };
export type Distance = { value: number; unit: 'foot' | 'mile' };
export type CellPlace = { kind: 'spot' | 'near'; name: string } | { kind: 'from'; name: string; distance: Distance } | { kind: 'nowhere' };

/** Quarters of the busiest cell on show (counts are at least 1): the busiest is 4. */
export function heatLevel(count: number, max: number): HeatLevel {
  return Math.ceil((4 * count) / max) as HeatLevel;
}

// A US site: distances are in feet, then miles — never from the locale (frontend CLAUDE.md).
const FEET_PER_METER = 3.28084;
const FEET_PER_MILE = 5280;
const ROUND_TO_FEET = 50;

/** Feet to the nearest 50 under a quarter mile, then miles to a tenth. */
function imperial(meters: number): Distance {
  const feet = meters * FEET_PER_METER;
  return feet < FEET_PER_MILE / 4
    ? { value: Math.round(feet / ROUND_TO_FEET) * ROUND_TO_FEET, unit: 'foot' }
    : { value: Math.round((feet / FEET_PER_MILE) * 10) / 10, unit: 'mile' };
}

// Coordinates mean nothing to neighbors, so every cell is named after a feeding spot.

export function describeCell(cell: Cell, spots: SpotView[]): CellPlace {
  if (cell.spotName) return { kind: 'spot', name: cell.spotName };
  const near = nearestSpot(cell.location, spots);
  if (near) return { kind: 'near', name: near.name };
  const closest = closestSpot(cell.location, spots);
  if (!closest) return { kind: 'nowhere' };
  return { kind: 'from', name: closest.spot.name, distance: imperial(closest.meters) };
}

/** One place per spot: every block near a spot counts at the spot, so its name appears once. Busiest first. */
export function mergeNearSpots(cells: Cell[], spots: SpotView[]): Cell[] {
  const merged: Cell[] = [];
  const atSpot = new Map<string, Cell>();
  for (const cell of cells) {
    const near = cell.spotName ? null : nearestSpot(cell.location, spots);
    const existing = near && atSpot.get(near.id);
    if (existing) existing.count += cell.count;
    else if (near) {
      const folded = { location: near.location, count: cell.count, spotName: null };
      atSpot.set(near.id, folded);
      merged.push(folded);
    } else merged.push(cell);
  }
  // Stable, so equal counts keep the server's order.
  return merged.sort((a, b) => b.count - a.count);
}
