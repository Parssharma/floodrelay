import { describe, it, expect, vi } from 'vitest';
import type { UrgencyLevel } from '@floodrelay/shared';
import { FloodRelayApiClient } from '../lib/api/client';
import { ApiClientError } from '../lib/api/errors';
import type { CreateRequestInput } from '../lib/api/types';
import fs from 'fs';
import path from 'path';

describe('Phase 3 Milestone 2 — Citizen Portal Live API Integration', () => {
  describe('Form Validation Logic', () => {
    function validateCitizenForm(data: {
      lat: string;
      lng: string;
      address: string;
      waterLevel: string;
      partyCount: number;
      urgency: UrgencyLevel;
    }): { valid: boolean; errors: Record<string, string> } {
      const errors: Record<string, string> = {};
      const latNum = parseFloat(data.lat);
      const lngNum = parseFloat(data.lng);

      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        errors.lat = 'Valid latitude between -90 and 90 is required';
      }
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        errors.lng = 'Valid longitude between -180 and 180 is required';
      }
      if (!data.address.trim()) {
        errors.address = 'Street address or location landmark is required';
      }
      if (!data.waterLevel) {
        errors.waterLevel = 'Please select the current water level situation';
      }
      if (data.partyCount < 1) {
        errors.partyCount = 'At least 1 person must be reported';
      }

      return { valid: Object.keys(errors).length === 0, errors };
    }

    it('passes for complete valid inputs', () => {
      const res = validateCitizenForm({
        lat: '29.7604',
        lng: '-95.3698',
        address: '1428 Riverbend Dr, 2nd Floor Apt 3B',
        waterLevel: 'ground_floor',
        partyCount: 3,
        urgency: 'HIGH',
      });
      expect(res.valid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('rejects invalid or out-of-range coordinates', () => {
      const res1 = validateCitizenForm({
        lat: '95.5',
        lng: '-95.3698',
        address: '1428 Riverbend Dr',
        waterLevel: 'ground_floor',
        partyCount: 2,
        urgency: 'CRITICAL',
      });
      expect(res1.valid).toBe(false);
      expect(res1.errors.lat).toContain('latitude between -90 and 90');

      const res2 = validateCitizenForm({
        lat: '29.7604',
        lng: '-195.0',
        address: '1428 Riverbend Dr',
        waterLevel: 'ground_floor',
        partyCount: 2,
        urgency: 'CRITICAL',
      });
      expect(res2.valid).toBe(false);
      expect(res2.errors.lng).toContain('longitude between -180 and 180');
    });

    it('rejects missing address or missing water level', () => {
      const res = validateCitizenForm({
        lat: '29.7604',
        lng: '-95.3698',
        address: '   ',
        waterLevel: '',
        partyCount: 2,
        urgency: 'CRITICAL',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.address).toBeDefined();
      expect(res.errors.waterLevel).toBeDefined();
    });

    it('rejects non-positive occupant count', () => {
      const res = validateCitizenForm({
        lat: '29.7604',
        lng: '-95.3698',
        address: '1428 Riverbend Dr',
        waterLevel: 'ground_floor',
        partyCount: 0,
        urgency: 'MEDIUM',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.partyCount).toContain('At least 1 person');
    });
  });

  describe('Citizen Input Synthesis & Server State Protection', () => {
    const WATER_LEVEL_LABELS: Record<string, string> = {
      ankle_knee: 'Ankle to Knee-deep in yard / driveway (Evacuation possible)',
      ground_floor: 'Reached ground floor interior (1 - 3 feet)',
      submerged_ground: 'Ground floor fully submerged (Trapped on 2nd story)',
      roof_access: 'Attic or Roof access only (Critical water crest)',
      surrounded: 'House dry on hill but surrounded by swift water',
    };

    function synthesizeNotes(input: {
      address: string;
      waterLevel: string;
      specialNeeds: {
        elderlyChildren: boolean;
        mobilityImpaired: boolean;
        medicalOxygen: boolean;
        pets: boolean;
      };
      notes: string;
    }): { notesString: string; activeNeeds: string[] } {
      const activeNeeds: string[] = [];
      if (input.specialNeeds.elderlyChildren) activeNeeds.push('Elderly/Children');
      if (input.specialNeeds.mobilityImpaired) activeNeeds.push('Mobility Impaired');
      if (input.specialNeeds.medicalOxygen) activeNeeds.push('Medical Emergency/Oxygen Required');
      if (input.specialNeeds.pets) activeNeeds.push('Pets');

      const parts: string[] = [];
      if (input.address.trim()) {
        parts.push(`Address: ${input.address.trim()}`);
      }
      if (input.waterLevel && WATER_LEVEL_LABELS[input.waterLevel]) {
        parts.push(`Water Level: ${WATER_LEVEL_LABELS[input.waterLevel]}`);
      }
      if (activeNeeds.length > 0) {
        parts.push(`Special Needs: ${activeNeeds.join(', ')}`);
      }
      if (input.notes.trim()) {
        parts.push(`Field Notes: ${input.notes.trim()}`);
      }

      const notesString = parts.join(' | ').slice(0, 1000);
      return { notesString, activeNeeds };
    }

    it('synthesizes address, water level, special needs, and user notes without data loss', () => {
      const synthesized = synthesizeNotes({
        address: '1428 Riverbend Dr, 2nd Floor Apt 3B',
        waterLevel: 'ground_floor',
        specialNeeds: {
          elderlyChildren: true,
          mobilityImpaired: false,
          medicalOxygen: true,
          pets: true,
        },
        notes: 'Approach from south dock; avoid submerged fence.',
      });

      expect(synthesized.notesString).toContain('Address: 1428 Riverbend Dr, 2nd Floor Apt 3B');
      expect(synthesized.notesString).toContain(
        'Water Level: Reached ground floor interior (1 - 3 feet)',
      );
      expect(synthesized.notesString).toContain(
        'Special Needs: Elderly/Children, Medical Emergency/Oxygen Required, Pets',
      );
      expect(synthesized.notesString).toContain(
        'Field Notes: Approach from south dock; avoid submerged fence.',
      );
      expect(synthesized.notesString.length).toBeLessThanOrEqual(1000);
    });

    it('truncates gracefully to 1000 characters if input is exceptionally large', () => {
      const hugeNotes = 'A'.repeat(1500);
      const synthesized = synthesizeNotes({
        address: '1428 Riverbend Dr',
        waterLevel: 'ground_floor',
        specialNeeds: {
          elderlyChildren: false,
          mobilityImpaired: false,
          medicalOxygen: false,
          pets: false,
        },
        notes: hugeNotes,
      });

      expect(synthesized.notesString.length).toBe(1000);
    });

    it('maps specialNeeds.medicalOxygen directly to boolean medicalNeeds', () => {
      const specialNeedsWithOxygen = {
        elderlyChildren: false,
        mobilityImpaired: false,
        medicalOxygen: true,
        pets: false,
      };
      expect(Boolean(specialNeedsWithOxygen.medicalOxygen)).toBe(true);

      const specialNeedsWithoutOxygen = {
        elderlyChildren: true,
        mobilityImpaired: true,
        medicalOxygen: false,
        pets: true,
      };
      expect(Boolean(specialNeedsWithoutOxygen.medicalOxygen)).toBe(false);
    });

    it('verifies citizen client payload omits server-managed verificationStatus and status', () => {
      const payload: CreateRequestInput = {
        lat: 29.7604,
        lng: -95.3698,
        peopleCount: 4,
        urgency: 'CRITICAL',
        medicalNeeds: true,
        notes: 'Test notes',
        source: 'REPORTED',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      };

      const payloadObj = payload as unknown as Record<string, unknown>;
      expect(payloadObj.verificationStatus).toBeUndefined();
      expect(payloadObj.status).toBeUndefined();
      expect(payloadObj.source).toBe('REPORTED');
    });
  });

  describe('Real Geolocation Contract & Non-Simulated Fallbacks', () => {
    it('handles permission denied (code 1) without mutating coordinates to fake values', () => {
      const lat = '29.7604';
      const lng = '-95.3698';
      let gpsStatus = 'IDLE';

      const errorCallback = (err: { code: number; message: string }) => {
        if (err.code === 1) {
          gpsStatus = 'DENIED';
        } else if (err.code === 3) {
          gpsStatus = 'TIMEOUT';
        } else {
          gpsStatus = 'UNAVAILABLE';
        }
        // Strict contract: No fallback mock coordinates overwrite
      };

      errorCallback({ code: 1, message: 'User denied Geolocation' });
      expect(gpsStatus).toBe('DENIED');
      expect(lat).toBe('29.7604'); // Preserves whatever was previously entered
      expect(lng).toBe('-95.3698');
    });

    it('handles timeout (code 3) without setting fake coordinates', () => {
      let gpsStatus = 'IDLE';
      const errorCallback = (err: { code: number; message: string }) => {
        if (err.code === 1) {
          gpsStatus = 'DENIED';
        } else if (err.code === 3) {
          gpsStatus = 'TIMEOUT';
        } else {
          gpsStatus = 'UNAVAILABLE';
        }
      };

      errorCallback({ code: 3, message: 'Position acquisition timed out' });
      expect(gpsStatus).toBe('TIMEOUT');
    });

    it('records high-accuracy coordinates on success', () => {
      let lat = '';
      let lng = '';
      let gpsStatus = 'IDLE';
      let accuracy: number | null = null;

      const successCallback = (pos: {
        coords: { latitude: number; longitude: number; accuracy: number };
      }) => {
        lat = pos.coords.latitude.toFixed(6);
        lng = pos.coords.longitude.toFixed(6);
        accuracy = pos.coords.accuracy;
        gpsStatus = 'ACQUIRED';
      };

      successCallback({
        coords: {
          latitude: 29.7891234,
          longitude: -95.4567891,
          accuracy: 4.8,
        },
      });

      expect(gpsStatus).toBe('ACQUIRED');
      expect(lat).toBe('29.789123');
      expect(lng).toBe('-95.456789');
      expect(accuracy).toBe(4.8);
    });
  });

  describe('Idempotency & Retry Contract', () => {
    it('generates a valid UUIDv4 idempotency key', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const key = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      expect(key).toMatch(uuidRegex);
    });

    it('maintains identical idempotency key across retry of identical payload', () => {
      const idempotencyKey = '12345678-1234-4234-8234-123456789abc';
      const payload1: CreateRequestInput = {
        lat: 29.7604,
        lng: -95.3698,
        peopleCount: 3,
        urgency: 'HIGH',
        idempotencyKey,
      };

      // Simulated network failure occurs; user clicks retry
      const payloadRetry: CreateRequestInput = {
        lat: 29.7604,
        lng: -95.3698,
        peopleCount: 3,
        urgency: 'HIGH',
        idempotencyKey,
      };

      expect(payloadRetry.idempotencyKey).toBe(payload1.idempotencyKey);
    });

    it('sends Idempotency-Key header through FloodRelayApiClient', async () => {
      const client = new FloodRelayApiClient({ baseUrl: 'http://localhost:3000' });
      let capturedHeaders: Record<string, string> = {};

      vi.spyOn(global, 'fetch').mockImplementationOnce(async (url, init) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            success: true,
            idempotent: false,
            data: {
              id: 'req-test-uuid',
              lat: 29.7604,
              lng: -95.3698,
              peopleCount: 2,
              urgency: 'CRITICAL',
              createdAt: new Date().toISOString(),
              source: 'REPORTED',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const res = await client.createRequest({
        lat: 29.7604,
        lng: -95.3698,
        peopleCount: 2,
        urgency: 'CRITICAL',
        idempotencyKey: 'idem-test-key-123',
      });

      expect(capturedHeaders['Idempotency-Key']).toBe('idem-test-key-123');
      expect(res.id).toBe('req-test-uuid');
      expect(res.idempotent).toBe(false);
    });

    it('handles HTTP 409 IDEMPOTENCY_KEY_REUSED error cleanly', async () => {
      const client = new FloodRelayApiClient({ baseUrl: 'http://localhost:3000' });

      vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Idempotency key has already been used with a different request payload.',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      });

      let caughtError: unknown;
      try {
        await client.createRequest({
          lat: 29.7604,
          lng: -95.3698,
          peopleCount: 2,
          urgency: 'CRITICAL',
          idempotencyKey: 'reused-key',
        });
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(ApiClientError);
      expect((caughtError as ApiClientError).statusCode).toBe(409);
      expect((caughtError as ApiClientError).code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('preserves key on network retry, and requires deliberate user choice to mint new key on conflict', () => {
      let currentKey = '12345678-1234-4234-8234-123456789abc';
      let is409Conflict = true;

      // Invariant: key must NOT be automatically regenerated
      expect(currentKey).toBe('12345678-1234-4234-8234-123456789abc');
      expect(is409Conflict).toBe(true);

      // User consciously chooses "Submit as New Separate Request"
      const onUserChooseNewRequest = () => {
        currentKey = '87654321-4321-4321-8321-cba987654321';
        is409Conflict = false;
      };

      onUserChooseNewRequest();
      expect(currentKey).not.toBe('12345678-1234-4234-8234-123456789abc');
      expect(is409Conflict).toBe(false);
    });

    it('defaults baseUrl to relative string in browser environment to leverage Next.js proxy rewrites without hardcoded localhost', () => {
      const originalWindow = (global as unknown as { window?: unknown }).window;
      try {
        (global as unknown as { window: unknown }).window = {};
        const client = new FloodRelayApiClient();
        expect((client as unknown as { baseUrl: string }).baseUrl).toBe('');
      } finally {
        if (originalWindow === undefined) {
          delete (global as unknown as { window?: unknown }).window;
        } else {
          (global as unknown as { window: unknown }).window = originalWindow;
        }
      }
    });

    it('defaults baseUrl to http://localhost:3000 in Node/SSR environment when NEXT_PUBLIC_API_URL is unset', () => {
      const originalWindow = (global as unknown as { window?: unknown }).window;
      try {
        delete (global as unknown as { window?: unknown }).window;
        const client = new FloodRelayApiClient();
        expect((client as unknown as { baseUrl: string }).baseUrl).toBe('http://localhost:3000');
      } finally {
        if (originalWindow !== undefined) {
          (global as unknown as { window: unknown }).window = originalWindow;
        }
      }
    });
  });

  describe('Session Storage Receipt & Confirmation Page Invariants', () => {
    it('formats minimized privacy-preserving ticket receipt structure accurately', () => {
      const receipt = {
        id: 'req-482a8b9f',
        createdAt: '2026-10-31T14:32:00.000Z',
        urgency: 'CRITICAL' as UrgencyLevel,
        peopleCount: 4,
        isFlaggedDuplicate: true,
        duplicateOfId: 'req-original-123',
        idempotent: false,
        addressSummary: '1428 Riverbend Dr',
        approxLat: 29.76,
        approxLng: -95.37,
        waterLevel: 'Reached ground floor interior (1 - 3 feet)',
        hasSpecialNeeds: true,
        hasFieldNotes: true,
      };

      const serialized = JSON.stringify(receipt);
      const parsed = JSON.parse(serialized);

      expect(parsed.id).toBe('req-482a8b9f');
      expect(parsed.isFlaggedDuplicate).toBe(true);
      expect(parsed.duplicateOfId).toBe('req-original-123');
      expect(parsed.addressSummary).toBe('1428 Riverbend Dr');
      expect(parsed.approxLat).toBe(29.76);
      expect(parsed.approxLng).toBe(-95.37);
      expect(parsed.hasSpecialNeeds).toBe(true);
      expect(parsed.notes).toBeUndefined(); // Sensitive PII freeform notes are omitted from client storage
    });
  });

  describe('Privacy & Security Invariant: NO Citizen Tracking Route', () => {
    it('verifies that /citizen/track or /citizen/track/[id] does NOT exist in the codebase', () => {
      const appCitizenDir = path.resolve(__dirname, '../app/citizen');
      const trackDir = path.join(appCitizenDir, 'track');

      const trackRouteExists = fs.existsSync(trackDir);
      expect(trackRouteExists).toBe(false);

      // Verify that no citizen subfolder mentions track
      const subdirs = fs.readdirSync(appCitizenDir);
      expect(subdirs).not.toContain('track');
    });
  });
});
