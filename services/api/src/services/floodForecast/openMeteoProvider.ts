import type {
  FloodForecastContext,
  ForecastRiskLevel,
  DailyDischargeForecast,
} from '@floodrelay/shared';
import type { FloodForecastProvider, ForecastQueryOptions } from './types.js';

interface OpenMeteoFloodApiResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation?: number;
  daily_units: {
    time: string;
    river_discharge?: string;
    river_discharge_mean?: string;
    river_discharge_max?: string;
    river_discharge_min?: string;
  };
  daily: {
    time: string[];
    river_discharge?: number[];
    river_discharge_mean?: number[];
    river_discharge_max?: number[];
    river_discharge_min?: number[];
  };
}

export const DEFAULT_YAMUNA_LAT = 28.65;
export const DEFAULT_YAMUNA_LNG = 77.23;
export const DEFAULT_FORECAST_DAYS = 7;
export const FORECAST_DISCLAIMER =
  'Informational hydrological context based on European Centre for Medium-Range Weather Forecasts (ECMWF) GloFAS 4.0 gridded river discharge model via Open-Meteo (CC BY 4.0). Does not measure localized street inundation, urban flash flooding, or measured gauge levels at Delhi Old Railway Bridge. This layer is informational only and does not trigger autonomous rescue dispatch or modify committed routes.';

export function classifyDischargeRisk(maxDischargeM3S: number): ForecastRiskLevel {
  if (maxDischargeM3S >= 800) return 'EXTREME';
  if (maxDischargeM3S >= 200) return 'HIGH';
  if (maxDischargeM3S >= 50) return 'ELEVATED';
  return 'NORMAL';
}

export class OpenMeteoFloodForecastProvider implements FloodForecastProvider {
  public readonly name = 'OpenMeteo-GloFAS';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: { baseUrl?: string; timeoutMs?: number }) {
    this.baseUrl = options?.baseUrl || 'https://flood-api.open-meteo.com/v1/flood';
    this.timeoutMs = options?.timeoutMs || 5000;
  }

  async getForecast(options?: ForecastQueryOptions): Promise<FloodForecastContext> {
    const lat = options?.lat ?? DEFAULT_YAMUNA_LAT;
    const lng = options?.lng ?? DEFAULT_YAMUNA_LNG;
    const days = Math.min(Math.max(options?.days ?? DEFAULT_FORECAST_DAYS, 1), 14);

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error(
        `Invalid coordinates: lat=${lat}, lng=${lng}. Must be valid WGS84 coordinates.`,
      );
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lng.toFixed(4));
    url.searchParams.set(
      'daily',
      'river_discharge,river_discharge_mean,river_discharge_max,river_discharge_min',
    );
    url.searchParams.set('forecast_days', days.toString());

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'FloodRelay-HydrologicalContext/1.0',
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Upstream flood provider returned HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as OpenMeteoFloodApiResponse;
      return this.transformResponse(json, lat, lng, days, 'FRESH');
    } catch {
      // In air-gapped / offline testing or when provider is unreachable, supply deterministic fallback fixture
      return this.getFallbackFixture(lat, lng, days);
    }
  }

  private transformResponse(
    json: OpenMeteoFloodApiResponse,
    targetLat: number,
    targetLng: number,
    days: number,
    freshness: 'FRESH' | 'CACHED' | 'STALE',
  ): FloodForecastContext {
    const dates = json.daily.time || [];
    const discharge = json.daily.river_discharge || [];
    const mean = json.daily.river_discharge_mean || [];
    const max = json.daily.river_discharge_max || [];
    const min = json.daily.river_discharge_min || [];

    const daily: DailyDischargeForecast[] = dates.map((date, idx) => ({
      date,
      dischargeM3S: Number((discharge[idx] ?? mean[idx] ?? 0).toFixed(2)),
      dischargeMeanM3S: Number((mean[idx] ?? discharge[idx] ?? 0).toFixed(2)),
      dischargeMaxM3S: Number((max[idx] ?? discharge[idx] ?? 0).toFixed(2)),
      dischargeMinM3S: Number((min[idx] ?? discharge[idx] ?? 0).toFixed(2)),
    }));

    const currentDischargeM3S = daily[0]?.dischargeM3S ?? 0;
    const peakForecastM3S = daily.reduce((acc, d) => Math.max(acc, d.dischargeMaxM3S), 0);
    const riskCategory = classifyDischargeRisk(peakForecastM3S);

    const retrievedAt = new Date().toISOString();

    return {
      provider: 'Copernicus EMS GloFAS via Open-Meteo',
      source: 'ECMWF GloFAS 4.0 Gridded Hydrological Model',
      attribution:
        'Contains modified Copernicus Emergency Management Service information (GloFAS) via Open-Meteo under CC BY 4.0',
      license: 'CC BY 4.0',
      region: {
        name: 'Yamuna River Basin (Delhi Reach)',
        targetLat,
        targetLng,
        stationLat: json.latitude,
        stationLng: json.longitude,
        elevationMeters: json.elevation,
      },
      issuedAt: dates[0] ? `${dates[0]}T00:00:00.000Z` : retrievedAt,
      retrievedAt,
      validFrom: dates[0] ? `${dates[0]}T00:00:00.000Z` : retrievedAt,
      validTo: dates[dates.length - 1] ? `${dates[dates.length - 1]}T23:59:59.000Z` : retrievedAt,
      forecastHorizonDays: days,
      variable: {
        name: 'river_discharge',
        unit: json.daily_units?.river_discharge || 'm³/s',
        description: 'Simulated daily river discharge rate in cubic meters per second',
      },
      daily,
      currentDischargeM3S,
      peakForecastM3S,
      riskCategory,
      confidenceScore: 0.85,
      freshness,
      disclaimer: FORECAST_DISCLAIMER,
    };
  }

  public getFallbackFixture(
    targetLat = DEFAULT_YAMUNA_LAT,
    targetLng = DEFAULT_YAMUNA_LNG,
    days = DEFAULT_FORECAST_DAYS,
  ): FloodForecastContext {
    const today = new Date();
    const daily: DailyDischargeForecast[] = [];

    // Realistic baseline discharge for Yamuna at Delhi reach (simulated fixture)
    const baseDischarges = [4.28, 4.25, 4.24, 4.22, 4.22, 4.22, 4.21, 4.2, 4.19, 4.18];

    for (let i = 0; i < days; i++) {
      const d = new Date(today.getTime() + i * 24 * 3600 * 1000);
      const dateStr = d.toISOString().split('T')[0]!;
      const val = baseDischarges[i % baseDischarges.length]!;
      daily.push({
        date: dateStr,
        dischargeM3S: val,
        dischargeMeanM3S: val,
        dischargeMaxM3S: val,
        dischargeMinM3S: val,
      });
    }

    const currentDischargeM3S = daily[0]?.dischargeM3S ?? 4.28;
    const peakForecastM3S = daily.reduce((acc, d) => Math.max(acc, d.dischargeMaxM3S), 0);
    const retrievedAt = new Date().toISOString();

    return {
      provider: 'Copernicus EMS GloFAS via Open-Meteo (Deterministic Offline Fixture)',
      source: 'ECMWF GloFAS 4.0 Gridded Hydrological Model (Simulated Fallback)',
      attribution:
        'Contains simulated hydrological context modeled on Copernicus Emergency Management Service under CC BY 4.0',
      license: 'CC BY 4.0',
      region: {
        name: 'Yamuna River Basin (Delhi Reach - Offline Model)',
        targetLat,
        targetLng,
        stationLat: 28.675,
        stationLng: 77.225,
        elevationMeters: 227,
      },
      issuedAt: `${daily[0]!.date}T00:00:00.000Z`,
      retrievedAt,
      validFrom: `${daily[0]!.date}T00:00:00.000Z`,
      validTo: `${daily[daily.length - 1]!.date}T23:59:59.000Z`,
      forecastHorizonDays: days,
      variable: {
        name: 'river_discharge',
        unit: 'm³/s',
        description:
          'Simulated daily river discharge rate in cubic meters per second (offline test fallback)',
      },
      daily,
      currentDischargeM3S,
      peakForecastM3S,
      riskCategory: classifyDischargeRisk(peakForecastM3S),
      confidenceScore: 0.8,
      freshness: 'OFFLINE_FIXTURE',
      disclaimer: `${FORECAST_DISCLAIMER} (CURRENTLY DISPLAYING DETERMINISTIC OFFLINE FIXTURE AS LIVE NETWORK WAS UNREACHABLE).`,
    };
  }
}
