import type { BlockedZone } from '@floodrelay/shared';
import type { StagedAsset, StagedShelter } from '@/components/operator/map/LeafletMapCanvas';

/**
 * Scenario metadata and tactical map coordinates derived from scenarios/sample-scenario.json.
 */
export const MAP_SCENARIO_NAME = 'Yamuna Flood Relief - North Delhi Basin (Simulated)';
export const MAP_SCENARIO_COORDINATES = '28.67° N, 77.23° E';

export const HOUSTON_ANCHOR: [number, number] = [29.7604, -95.3698];
export const DELHI_ANCHOR: [number, number] = [28.671, 77.234];

/**
 * Staged fleet roster for reference display on the Operations GIS Tactical Map.
 * Mirrored directly from scenarios/sample-scenario.json resources.
 */
export const STAGED_SECTOR_FLEET: StagedAsset[] = [
  {
    id: 'res-boat-01',
    name: 'NDRF Boat Alpha (Reference)',
    type: 'BOAT',
    capacity: 8,
    speedKmH: 25,
    lat: 28.66,
    lng: 77.22,
    status: 'AVAILABLE',
    depotName: 'Kashmere Gate Relief Camp (Reference)',
    source: 'SIMULATED',
  },
  {
    id: 'res-boat-02',
    name: 'NDRF Boat Bravo (Reference)',
    type: 'BOAT',
    capacity: 10,
    speedKmH: 25,
    lat: 28.68,
    lng: 77.23,
    status: 'AVAILABLE',
    depotName: 'Wazirabad Community Relief Centre (Reference)',
    source: 'SIMULATED',
  },
  {
    id: 'res-truck-01',
    name: 'High-Clearance Rescue Truck 1 (Reference)',
    type: 'HIGH_WATER_VEHICLE',
    capacity: 15,
    speedKmH: 40,
    lat: 28.65,
    lng: 77.21,
    status: 'AVAILABLE',
    depotName: 'Yamuna Floodplain Relief Depot (Reference)',
    source: 'SIMULATED',
  },
];

/**
 * Designated sector relief shelters for reference display on the Operations GIS Tactical Map.
 * Mirrored directly from scenarios/sample-scenario.json shelters.
 */
export const STAGED_SECTOR_SHELTERS: StagedShelter[] = [
  {
    id: 'shelter-kashmere-gate',
    name: 'Kashmere Gate Relief Camp (Reference)',
    lat: 28.668,
    lng: 77.232,
    capacity: 120,
    availableBeds: 100,
    status: 'Open — Primary Relief Camp (Reference)',
    source: 'SIMULATED',
  },
  {
    id: 'shelter-wazirabad',
    name: 'Wazirabad Community Relief Centre (Reference)',
    lat: 28.705,
    lng: 77.228,
    capacity: 150,
    availableBeds: 115,
    status: 'Open — Community Relief Centre (Reference)',
    source: 'SIMULATED',
  },
];

export type ReferenceBlockedZone = BlockedZone & { source: 'SIMULATED' };

/**
 * Designated sector hazard zones for reference display on the Operations GIS Tactical Map.
 * Mirrored directly from scenarios/sample-scenario.json blockedZones.
 */
export const STAGED_SECTOR_BLOCKED_ZONES: ReferenceBlockedZone[] = [
  {
    id: 'zone-old-railway-bridge',
    name: 'Old Railway Bridge - Submerged (Reference)',
    severity: 'BLOCKED',
    polygon: [
      { lat: 28.662, lng: 77.24 },
      { lat: 28.665, lng: 77.245 },
      { lat: 28.661, lng: 77.247 },
      { lat: 28.658, lng: 77.242 },
    ],
    source: 'SIMULATED',
  },
];

/**
 * Pure helper to translate a coordinate pair or point from a source anchor to a target anchor,
 * preserving all exact relative spatial offsets.
 */
export function rebaseLatLng<T extends { lat: number; lng: number }>(
  point: T,
  fromAnchor?: [number, number],
  toAnchor?: [number, number],
): T;
export function rebaseLatLng(
  point: [number, number],
  fromAnchor?: [number, number],
  toAnchor?: [number, number],
): [number, number];
export function rebaseLatLng(
  point: { lat: number; lng: number } | [number, number],
  fromAnchor: [number, number] = HOUSTON_ANCHOR,
  toAnchor: [number, number] = DELHI_ANCHOR,
): { lat: number; lng: number } | [number, number] {
  if (Array.isArray(point)) {
    const dLat = point[0] - fromAnchor[0];
    const dLng = point[1] - fromAnchor[1];
    return [toAnchor[0] + dLat, toAnchor[1] + dLng];
  }
  const dLat = point.lat - fromAnchor[0];
  const dLng = point.lng - fromAnchor[1];
  return {
    ...point,
    lat: toAnchor[0] + dLat,
    lng: toAnchor[1] + dLng,
  };
}
