import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ResourceStatusPanel } from '../components/operator/ResourceStatusPanel';
import { SIMULATED_RESOURCES } from '../lib/fixtures/resources';
import type { RescueResource } from '@floodrelay/shared';

// Mock OperatorAuthContext
vi.mock('@/lib/auth/OperatorAuthContext', () => ({
  useOperatorAuth: () => ({
    operator: {
      id: 'op-dispatcher-1',
      username: 'lead_dispatcher',
      role: 'DISPATCHER',
    },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

describe('Phase 5 Part 3 — Operational Resource Data Disclosure & Simulation Safeguards', () => {
  it('renders the missing authoritative endpoint banner (GET /operations/resources)', () => {
    const html = renderToString(
      React.createElement(ResourceStatusPanel, {
        resources: SIMULATED_RESOURCES,
      }),
    );

    expect(html).toContain(
      'Authoritative Resource Read Endpoint Pending (GET /operations/resources)',
    );
    expect(html).toContain('The backend API currently provides status mutation via');
    expect(html).toContain('PATCH /operations/resources/:id/status');
    expect(html).toContain('[REFERENCE / SIMULATED ASSETS]');
  });

  it('marks simulated reference assets with REFERENCE tag and disables status updates', () => {
    const html = renderToString(
      React.createElement(ResourceStatusPanel, {
        resources: SIMULATED_RESOURCES,
      }),
    );

    // Simulated resources must have REFERENCE tag
    expect(html).toContain('REFERENCE');
    // Simulated resources must have Read-only (Reference) label instead of update button
    expect(html).toContain('Read-only (Reference)');
  });

  it('allows Update button only for authentic non-simulated database resources', () => {
    const realResource: RescueResource = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Engine 42 High-Water Unit',
      type: 'HIGH_WATER_VEHICLE',
      capacity: 10,
      speedKmH: 35,
      lat: 29.76,
      lng: -95.36,
      status: 'AVAILABLE',
      source: 'REAL',
    };

    const mixedResources = [realResource, ...SIMULATED_RESOURCES];

    const html = renderToString(
      React.createElement(ResourceStatusPanel, {
        resources: mixedResources,
      }),
    );

    // The authentic resource should have an Update button
    expect(html).toContain('Update');
    // The simulated resources still have Read-only (Reference)
    expect(html).toContain('Read-only (Reference)');
  });

  it('provides a direct DB UUID override form for dispatchers', () => {
    const html = renderToString(
      React.createElement(ResourceStatusPanel, {
        resources: SIMULATED_RESOURCES,
      }),
    );

    expect(html).toContain('Direct DB ID Override');
  });
});
