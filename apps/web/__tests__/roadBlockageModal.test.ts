import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RoadBlockageModal } from '../components/operator/RoadBlockageModal';

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

describe('Phase 5 Part 3 — Road Blockage Modal Safeguards', () => {
  it('renders with empty initial coordinates instead of hardcoded coordinates', () => {
    const html = renderToString(
      React.createElement(RoadBlockageModal, {
        isOpen: true,
        onClose: () => {},
      }),
    );

    // Should NOT have hardcoded '29.7604' as input value (may appear in placeholder)
    // Input value attribute should be empty: value=""
    expect(html).toContain('id="hazardLat"');
    expect(html).toContain('id="hazardLng"');
    expect(html).toContain('value=""');
  });

  it('displays the mandatory Approximate Hazard Perimeter notice', () => {
    const html = renderToString(
      React.createElement(RoadBlockageModal, {
        isOpen: true,
        onClose: () => {},
      }),
    );

    expect(html).toContain('Approximate Hazard Perimeter:');
    expect(html).toContain(
      'The generated polygon is an approximate circular-bounding boundary centered at the input coordinates. It does not represent independently surveyed or field-sensor-verified flooded road boundaries.',
    );
  });

  it('renders the deliberate confirmation checkbox', () => {
    const html = renderToString(
      React.createElement(RoadBlockageModal, {
        isOpen: true,
        onClose: () => {},
      }),
    );

    expect(html).toContain('id="hazardConfirmation"');
    expect(html).toContain(
      'I confirm these coordinates represent a reported road blockage or surge hazard.',
    );
  });

  it('disables the submit button by default when coordinates and confirmation are missing', () => {
    const html = renderToString(
      React.createElement(RoadBlockageModal, {
        isOpen: true,
        onClose: () => {},
      }),
    );

    // Submit button should be disabled
    expect(html).toContain('disabled=""');
    expect(html).toContain('Register Road Closure');
  });
});
