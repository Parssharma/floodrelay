import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  STAGED_SECTOR_FLEET,
  STAGED_SECTOR_SHELTERS,
  STAGED_SECTOR_BLOCKED_ZONES,
  MAP_SCENARIO_NAME,
  MAP_SCENARIO_COORDINATES,
  HOUSTON_ANCHOR,
  DELHI_ANCHOR,
  rebaseLatLng,
} from '../lib/fixtures/mapReferenceData';

describe('Operator Map Reference Data & Coordinate Translation Invariants', () => {
  it('(a) rebaseLatLng maps the from anchor exactly to the to anchor and preserves relative offsets', () => {
    // Exact anchor mapping
    const rebasedTuple = rebaseLatLng(HOUSTON_ANCHOR, HOUSTON_ANCHOR, DELHI_ANCHOR);
    expect(rebasedTuple[0]).toBeCloseTo(DELHI_ANCHOR[0], 6);
    expect(rebasedTuple[1]).toBeCloseTo(DELHI_ANCHOR[1], 6);

    const rebasedObj = rebaseLatLng(
      { lat: HOUSTON_ANCHOR[0], lng: HOUSTON_ANCHOR[1] },
      HOUSTON_ANCHOR,
      DELHI_ANCHOR,
    );
    expect(rebasedObj.lat).toBeCloseTo(DELHI_ANCHOR[0], 6);
    expect(rebasedObj.lng).toBeCloseTo(DELHI_ANCHOR[1], 6);

    // Relative offset preservation
    const offsetLat = 0.042;
    const offsetLng = -0.018;

    const offsetTuple = rebaseLatLng(
      [HOUSTON_ANCHOR[0] + offsetLat, HOUSTON_ANCHOR[1] + offsetLng],
      HOUSTON_ANCHOR,
      DELHI_ANCHOR,
    );
    expect(offsetTuple[0]).toBeCloseTo(DELHI_ANCHOR[0] + offsetLat, 6);
    expect(offsetTuple[1]).toBeCloseTo(DELHI_ANCHOR[1] + offsetLng, 6);

    const offsetObj = rebaseLatLng(
      { lat: HOUSTON_ANCHOR[0] + offsetLat, lng: HOUSTON_ANCHOR[1] + offsetLng },
      HOUSTON_ANCHOR,
      DELHI_ANCHOR,
    );
    expect(offsetObj.lat).toBeCloseTo(DELHI_ANCHOR[0] + offsetLat, 6);
    expect(offsetObj.lng).toBeCloseTo(DELHI_ANCHOR[1] + offsetLng, 6);
  });

  it('(b) fixture data matches real seed file scenarios/sample-scenario.json exactly', () => {
    const seedPath = path.resolve(__dirname, '../../../scenarios/sample-scenario.json');
    expect(fs.existsSync(seedPath)).toBe(true);

    const seedRaw = fs.readFileSync(seedPath, 'utf8');
    const seed = JSON.parse(seedRaw);

    // Scenario metadata
    expect(MAP_SCENARIO_NAME).toBe(seed.metadata.name);
    expect(MAP_SCENARIO_NAME).toBe('Yamuna Flood Relief - North Delhi Basin (Simulated)');
    expect(MAP_SCENARIO_COORDINATES).toBe('28.67° N, 77.23° E');

    // Resources comparison (IDs, types, capacities, speeds, coordinates)
    expect(STAGED_SECTOR_FLEET).toHaveLength(seed.resources.length);
    seed.resources.forEach(
      (seedRes: {
        id: string;
        type: string;
        capacity: number;
        speedKmH: number;
        lat: number;
        lng: number;
      }) => {
        const match = STAGED_SECTOR_FLEET.find((r) => r.id === seedRes.id);
        expect(match).toBeDefined();
        expect(match?.type).toBe(seedRes.type);
        expect(match?.capacity).toBe(seedRes.capacity);
        expect(match?.speedKmH).toBe(seedRes.speedKmH);
        expect(match?.lat).toBe(seedRes.lat);
        expect(match?.lng).toBe(seedRes.lng);
        expect(match?.source).toBe('SIMULATED');
      },
    );

    // Shelters comparison (IDs, capacities, coordinates)
    expect(STAGED_SECTOR_SHELTERS).toHaveLength(seed.shelters.length);
    seed.shelters.forEach(
      (seedShelter: { id: string; capacity: number; lat: number; lng: number }) => {
        const match = STAGED_SECTOR_SHELTERS.find((s) => s.id === seedShelter.id);
        expect(match).toBeDefined();
        expect(match?.capacity).toBe(seedShelter.capacity);
        expect(match?.lat).toBe(seedShelter.lat);
        expect(match?.lng).toBe(seedShelter.lng);
        expect(match?.source).toBe('SIMULATED');
      },
    );

    // Blocked zones comparison (IDs, severities, polygon vertices)
    expect(STAGED_SECTOR_BLOCKED_ZONES).toHaveLength(seed.blockedZones.length);
    seed.blockedZones.forEach(
      (seedZone: { id: string; severity: string; polygon: { lat: number; lng: number }[] }) => {
        const match = STAGED_SECTOR_BLOCKED_ZONES.find((z) => z.id === seedZone.id);
        expect(match).toBeDefined();
        expect(match?.severity).toBe(seedZone.severity);
        expect(match?.polygon).toHaveLength(seedZone.polygon.length);
        seedZone.polygon.forEach((pt: { lat: number; lng: number }, idx: number) => {
          expect(match?.polygon[idx]?.lat).toBe(pt.lat);
          expect(match?.polygon[idx]?.lng).toBe(pt.lng);
        });
        expect(match?.source).toBe('SIMULATED');
      },
    );
  });

  it('(c) scans operator/map and components/operator/map sources and finds no forbidden legacy strings', () => {
    const targets = [
      path.resolve(__dirname, '../app/operator/map'),
      path.resolve(__dirname, '../components/operator/map'),
    ];

    const forbiddenPatterns = [
      /\bharris\b/i,
      /\bhouston\b/i,
      /buffalo\s+bayou/i,
      /\bheights\b/i,
      /\bnrg\b/i,
      /95\.36/i,
      /cartocdn/i,
      /carto\.com/i,
      /Sector 4/i,
      /Standby Roster/i,
      /Z-402/i,
      /Z-405/i,
    ];

    const filesToScan: string[] = [];
    function collectFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
          filesToScan.push(fullPath);
        }
      }
    }

    targets.forEach((t) => collectFiles(t));
    expect(filesToScan.length).toBeGreaterThanOrEqual(4);

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        expect(
          match,
          `File ${path.basename(filePath)} contains forbidden legacy pattern ${pattern}`,
        ).toBeNull();
      }
    }
  });
});
