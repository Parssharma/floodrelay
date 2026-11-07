import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { InMemoryAuthRepository, AuthService } from '../services/authService.js';
import { ForecastService } from '../services/floodForecast/forecastService.js';
import type { FloodForecastContext } from '@floodrelay/shared';

describe('GET /forecast/context Endpoint Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let inMemoryRepo: InMemoryAuthRepository;
  let forecastService: ForecastService;
  let sessionToken: string;

  const mockContext: FloodForecastContext = {
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
    ],
    currentDischargeM3S: 4.25,
    peakForecastM3S: 4.25,
    riskCategory: 'NORMAL',
    confidenceScore: 0.85,
    freshness: 'FRESH',
    disclaimer: 'Informational context only.',
  };

  beforeEach(async () => {
    inMemoryRepo = new InMemoryAuthRepository();
    authService = new AuthService(inMemoryRepo);

    await authService.createOperator({
      username: 'forecast_operator',
      password: 'SecurePassword123!',
      name: 'Forecast Test Operator',
      role: 'OPERATOR',
    });

    const loginRes = await authService.authenticate('forecast_operator', 'SecurePassword123!');
    sessionToken = loginRes.token;

    const mockProvider = {
      name: 'MockProvider',
      getForecast: vi.fn().mockResolvedValue(mockContext),
    };
    forecastService = new ForecastService({ provider: mockProvider });

    app = createApp({
      authService,
      forecastService,
    });
  });

  it('rejects unauthenticated requests to /forecast/context with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/forecast/context');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 OK with flood forecast context for authenticated operator', async () => {
    const res = await request(app)
      .get('/forecast/context')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.provider).toContain('Copernicus EMS GloFAS');
    expect(res.body.data.variable.unit).toBe('m³/s');
    expect(res.body.data.currentDischargeM3S).toBe(4.25);
    expect(res.body.data.riskCategory).toBe('NORMAL');
    expect(res.body.data.disclaimer).toBeDefined();
  });

  it('validates query parameters and returns 400 on hostile/invalid coordinates', async () => {
    const res = await request(app)
      .get('/forecast/context?lat=150&lng=77.23')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts valid custom coordinates and days parameter', async () => {
    const res = await request(app)
      .get('/forecast/context?lat=28.70&lng=77.25&days=5')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });
});
