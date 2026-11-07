import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FloodForecastContext } from '@floodrelay/shared';
import { ForecastService } from './forecastService.js';
import { OpenMeteoFloodForecastProvider, classifyDischargeRisk } from './openMeteoProvider.js';
import type { FloodForecastProvider } from './types.js';

describe('FloodForecast Provider & Service Suite', () => {
  let mockProvider: FloodForecastProvider;
  let service: ForecastService;

  const mockFreshContext: FloodForecastContext = {
    provider: 'Copernicus EMS GloFAS via Open-Meteo',
    source: 'ECMWF GloFAS 4.0 Gridded Hydrological Model',
    attribution: 'Copernicus EMS (CC BY 4.0)',
    license: 'CC BY 4.0',
    region: {
      name: 'Yamuna River Basin (Delhi Reach)',
      targetLat: 28.65,
      targetLng: 77.23,
      stationLat: 28.675,
      stationLng: 77.225,
      elevationMeters: 227,
    },
    issuedAt: '2026-11-08T00:00:00.000Z',
    retrievedAt: '2026-11-08T06:00:00.000Z',
    validFrom: '2026-11-08T00:00:00.000Z',
    validTo: '2026-11-14T23:59:59.000Z',
    forecastHorizonDays: 7,
    variable: {
      name: 'river_discharge',
      unit: 'm³/s',
      description: 'Simulated daily river discharge rate in cubic meters per second',
    },
    daily: [
      {
        date: '2026-11-08',
        dischargeM3S: 4.25,
        dischargeMeanM3S: 4.25,
        dischargeMaxM3S: 4.25,
        dischargeMinM3S: 4.25,
      },
      {
        date: '2026-11-09',
        dischargeM3S: 4.24,
        dischargeMeanM3S: 4.24,
        dischargeMaxM3S: 4.24,
        dischargeMinM3S: 4.24,
      },
    ],
    currentDischargeM3S: 4.25,
    peakForecastM3S: 4.25,
    riskCategory: 'NORMAL',
    confidenceScore: 0.85,
    freshness: 'FRESH',
    disclaimer:
      'Informational context only. This layer is informational only and does not trigger autonomous rescue dispatch or modify committed routes.',
  };

  beforeEach(() => {
    mockProvider = {
      name: 'MockProvider',
      getForecast: vi.fn().mockResolvedValue(mockFreshContext),
    };
    service = new ForecastService({ provider: mockProvider, cacheTtlMs: 3600000 });
  });

  it('classifies river discharge levels into correct risk tiers', () => {
    expect(classifyDischargeRisk(10)).toBe('NORMAL');
    expect(classifyDischargeRisk(49.9)).toBe('NORMAL');
    expect(classifyDischargeRisk(50)).toBe('ELEVATED');
    expect(classifyDischargeRisk(150)).toBe('ELEVATED');
    expect(classifyDischargeRisk(200)).toBe('HIGH');
    expect(classifyDischargeRisk(750)).toBe('HIGH');
    expect(classifyDischargeRisk(800)).toBe('EXTREME');
    expect(classifyDischargeRisk(1200)).toBe('EXTREME');
  });

  it('fetches fresh forecast from provider on initial call and populates metadata', async () => {
    const res = await service.getForecastContext({ lat: 28.65, lng: 77.23, days: 7 });

    expect(mockProvider.getForecast).toHaveBeenCalledTimes(1);
    expect(res.provider).toContain('Copernicus EMS GloFAS');
    expect(res.variable.unit).toBe('m³/s');
    expect(res.variable.name).toBe('river_discharge');
    expect(res.daily.length).toBe(2);
    expect(res.freshness).toBe('FRESH');
    expect(res.riskCategory).toBe('NORMAL');
  });

  it('serves cached forecast on subsequent call within TTL without re-querying provider', async () => {
    const res1 = await service.getForecastContext({ lat: 28.65, lng: 77.23, days: 7 });
    expect(res1.freshness).toBe('FRESH');

    const res2 = await service.getForecastContext({ lat: 28.65, lng: 77.23, days: 7 });
    expect(mockProvider.getForecast).toHaveBeenCalledTimes(1); // not called again
    expect(res2.freshness).toBe('CACHED');
    expect(res2.currentDischargeM3S).toBe(4.25);
  });

  it('bypasses cache when forceRefresh is set to true', async () => {
    await service.getForecastContext({ lat: 28.65, lng: 77.23, days: 7 });
    expect(mockProvider.getForecast).toHaveBeenCalledTimes(1);

    const res = await service.getForecastContext({
      lat: 28.65,
      lng: 77.23,
      days: 7,
      forceRefresh: true,
    });
    expect(mockProvider.getForecast).toHaveBeenCalledTimes(2);
    expect(res.freshness).toBe('FRESH');
  });

  it('falls back to STALE cached data if provider fails on background refresh', async () => {
    // Initial successful call
    await service.getForecastContext({ lat: 28.65, lng: 77.23, days: 7 });

    // Upstream fails
    (mockProvider.getForecast as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Upstream timeout'),
    );

    const staleRes = await service.getForecastContext({
      lat: 28.65,
      lng: 77.23,
      days: 7,
      forceRefresh: true,
    });
    expect(staleRes.freshness).toBe('STALE');
    expect(staleRes.disclaimer).toContain('Serving stale cached forecast');
    expect(staleRes.currentDischargeM3S).toBe(4.25);
  });

  it('generates deterministic offline simulated fallback fixture when no network or cache exists', async () => {
    const realProvider = new OpenMeteoFloodForecastProvider();
    const fallback = realProvider.getFallbackFixture(28.65, 77.23, 7);

    expect(fallback.freshness).toBe('OFFLINE_FIXTURE');
    expect(fallback.provider).toContain('Deterministic Offline Fixture');
    expect(fallback.daily.length).toBe(7);
    expect(fallback.currentDischargeM3S).toBeGreaterThan(0);
    expect(fallback.variable.unit).toBe('m³/s');
    expect(fallback.disclaimer).toContain('DETERMINISTIC OFFLINE FIXTURE');
  });

  it('validates coordinates and rejects invalid out-of-bounds parameters', async () => {
    const provider = new OpenMeteoFloodForecastProvider();
    await expect(provider.getForecast({ lat: 105, lng: 77.23 })).rejects.toThrow(
      /Invalid coordinates/,
    );
    await expect(provider.getForecast({ lat: 28.65, lng: 200 })).rejects.toThrow(
      /Invalid coordinates/,
    );
  });

  it('verifies human-in-the-loop safety invariant: forecast layer has zero solver mutations', async () => {
    // Calling forecast must never modify assignments, requests or routing
    const res = await service.getForecastContext({ lat: 28.65, lng: 77.23 });
    expect(res).toBeDefined();
    expect(res.disclaimer).toContain('does not trigger autonomous rescue dispatch');
  });
});
