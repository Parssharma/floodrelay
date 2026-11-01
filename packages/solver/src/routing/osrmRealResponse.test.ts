import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { GeoPoint } from '@floodrelay/shared';
import { OsrmTravelTimeProvider } from './osrmTravelTime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('OsrmTravelTimeProvider - Real response fixture verification', () => {
  it('serves real OSRM table response fixture and verifies conversions, asymmetry, and zero fallback', async () => {
    const fixturePath = join(__dirname, 'fixtures', 'osrm-table-real.json');
    const realResponse = JSON.parse(readFileSync(fixturePath, 'utf8'));

    const p1: GeoPoint = { lat: 28.67, lng: 77.22 };
    const p2: GeoPoint = { lat: 28.68, lng: 77.23 };

    let requestedUrl = '';
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => realResponse,
      };
    });

    const provider = new OsrmTravelTimeProvider({
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    await provider.prefetch([p1, p2], [p1, p2]);

    // (a) Request URL has lng,lat order (77.22,28.67;77.23,28.68)
    expect(requestedUrl).toContain('77.22,28.67;77.23,28.68');
    expect(requestedUrl).not.toContain('28.67,77.22');

    // (b) Distance 4405.9 m becomes 4.406 km and 3465.4 m becomes 3.465 km
    const est12 = provider.getTravelEstimate(p1, p2);
    const est21 = provider.getTravelEstimate(p2, p1);
    expect(est12.distanceKm).toBe(4.406);
    expect(est21.distanceKm).toBe(3.465);

    // (c) Without a vehicle speed the duration is the OSRM duration in minutes (341.8 s -> 5.7 min, 257 s -> 4.28 min)
    expect(est12.durationMinutes).toBe(5.7);
    expect(est21.durationMinutes).toBe(4.28);

    // (d) The two directions are not equal (asymmetry is preserved)
    expect(est12.distanceKm).not.toBe(est21.distanceKm);
    expect(est12.durationMinutes).not.toBe(est21.durationMinutes);

    // (e) The diagonal is 0
    const est11 = provider.getTravelEstimate(p1, p1);
    const est22 = provider.getTravelEstimate(p2, p2);
    expect(est11.distanceKm).toBe(0);
    expect(est11.durationMinutes).toBe(0);
    expect(est22.distanceKm).toBe(0);
    expect(est22.durationMinutes).toBe(0);

    // (f) No fallback was used (stats.failedRequests 0, lookupsFallback 0)
    const stats = provider.getStats();
    expect(stats.failedRequests).toBe(0);
    expect(stats.lookupsFallback).toBe(0);
    expect(stats.lookupsOsrm).toBe(4);
  });
});
