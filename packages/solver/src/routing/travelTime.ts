import type { GeoPoint } from '@floodrelay/shared';
import { haversineKm } from '../index.js';

/**
 * Placeholder assumption: ratio of road transit distance to geodesic straight-line distance.
 * This accounts for road winding and non-linear paths in urban/peri-urban road networks.
 */
export const ASSUMED_ROAD_DETOUR_FACTOR = 1.3;

/**
 * Placeholder assumption: fallback default vehicle speed in km/h when not explicitly specified on a resource.
 */
export const ASSUMED_DEFAULT_SPEED_KMH = 30;

/**
 * Placeholder assumption: baseline transit multiplier without flood impedance (shallow/flowing water slowdown uses > 1.0).
 */
export const ASSUMED_FLOOD_IMPEDANCE_MULTIPLIER = 1.0;

export interface TravelEstimate {
  distanceKm: number;
  durationMinutes: number;
}

export interface TravelTimeProvider {
  getTravelEstimate(
    from: GeoPoint,
    to: GeoPoint,
    speedKmH?: number,
    floodMultiplier?: number,
  ): TravelEstimate;
  getMatrix(
    origins: GeoPoint[],
    destinations: GeoPoint[],
    speedKmH?: number,
    floodMultiplier?: number,
  ): TravelEstimate[][];
}

/**
 * StraightLineTravelTimeProvider calculates geodesic distance via haversine,
 * scaled by a road network detour factor (default 1.3x) and flood impedance multiplier.
 */
export class StraightLineTravelTimeProvider implements TravelTimeProvider {
  constructor(
    private readonly detourFactor: number = ASSUMED_ROAD_DETOUR_FACTOR,
    private readonly defaultSpeedKmH: number = ASSUMED_DEFAULT_SPEED_KMH,
    private readonly floodImpedanceMultiplier: number = ASSUMED_FLOOD_IMPEDANCE_MULTIPLIER,
  ) {}

  getTravelEstimate(
    from: GeoPoint,
    to: GeoPoint,
    speedKmH?: number,
    floodMultiplier?: number,
  ): TravelEstimate {
    const rawDistance = haversineKm(from, to);
    const distanceKm = Number((rawDistance * this.detourFactor).toFixed(3));
    const speed = speedKmH && speedKmH > 0 ? speedKmH : this.defaultSpeedKmH;
    const impedance =
      floodMultiplier && floodMultiplier > 0 ? floodMultiplier : this.floodImpedanceMultiplier;
    const durationMinutes = Number(((distanceKm / speed) * 60 * impedance).toFixed(2));

    return {
      distanceKm,
      durationMinutes,
    };
  }

  getMatrix(
    origins: GeoPoint[],
    destinations: GeoPoint[],
    speedKmH?: number,
    floodMultiplier?: number,
  ): TravelEstimate[][] {
    return origins.map((origin) =>
      destinations.map((dest) => this.getTravelEstimate(origin, dest, speedKmH, floodMultiplier)),
    );
  }
}
