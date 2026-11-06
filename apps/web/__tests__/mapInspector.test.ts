import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MapInspectorDrawer } from '../components/operator/map/MapInspectorDrawer';
import type { SelectedMapEntity } from '../components/operator/map/LeafletMapCanvas';
import type { RescueRequest } from '@floodrelay/shared';
import { STAGED_SECTOR_FLEET, STAGED_SECTOR_SHELTERS } from '../lib/fixtures/mapReferenceData';

describe('Phase 3 & 5 — Tactical Map Inspector Drawer & Assignment Actions', () => {
  const sampleIncident: RescueRequest = {
    id: 'req-delhi-001',
    lat: 28.671,
    lng: 77.234,
    peopleCount: 4,
    urgency: 'CRITICAL',
    createdAt: '2026-10-15T12:00:00.000Z',
    source: 'SIMULATED',
    status: 'PENDING',
    notes: 'Elderly residents stranded near Yamuna floodplain',
    medicalNeeds: true,
  };

  const incidentEntity: SelectedMapEntity = {
    type: 'incident',
    item: sampleIncident,
  };

  const craftEntity: SelectedMapEntity = {
    type: 'craft',
    item: STAGED_SECTOR_FLEET[0]!,
  };

  const shelterEntity: SelectedMapEntity = {
    type: 'shelter',
    item: STAGED_SECTOR_SHELTERS[0]!,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders "Plan Assignment" button linking to /operator/assignments for an incident', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const html = renderToString(
      React.createElement(MapInspectorDrawer, {
        selectedEntity: incidentEntity,
        onClose: () => {},
      }),
    );

    // Button and link assertions
    expect(html).toContain('Plan Assignment');
    expect(html).toContain('href="/operator/assignments"');

    // Required disclaimer text
    expect(html).toContain(
      'Plans are proposed on the Assignments page and must be reviewed and committed by an operator.',
    );

    // Forbidden legacy strings
    expect(html).not.toContain('Dispatch Mutation Disabled');
    expect(html).not.toContain('Milestone 5');
    expect(html).not.toContain('(M5)');

    // No API calls made during render or navigation
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT render assignment button or link for a craft asset', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const html = renderToString(
      React.createElement(MapInspectorDrawer, {
        selectedEntity: craftEntity,
        onClose: () => {},
      }),
    );

    expect(html).not.toContain('Plan Assignment');
    expect(html).not.toContain('href="/operator/assignments"');
    expect(html).not.toContain('Dispatch Mutation Disabled');
    expect(html).not.toContain('Milestone 5');
    expect(html).not.toContain('(M5)');

    // Verify craft details render
    expect(html).toContain(craftEntity.item.name);
    expect(html).toContain(String(craftEntity.item.capacity));
    expect(html).toContain('Pax');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT render assignment button or link for a relief shelter', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const html = renderToString(
      React.createElement(MapInspectorDrawer, {
        selectedEntity: shelterEntity,
        onClose: () => {},
      }),
    );

    expect(html).not.toContain('Plan Assignment');
    expect(html).not.toContain('href="/operator/assignments"');
    expect(html).not.toContain('Dispatch Mutation Disabled');
    expect(html).not.toContain('Milestone 5');
    expect(html).not.toContain('(M5)');

    // Verify shelter details render
    expect(html).toContain(shelterEntity.item.name);
    expect(html).toContain(String(shelterEntity.item.availableBeds));
    expect(html).toContain('Beds');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders default inspector placeholder when selectedEntity is null', () => {
    const html = renderToString(
      React.createElement(MapInspectorDrawer, {
        selectedEntity: null,
        onClose: () => {},
      }),
    );

    expect(html).toContain('Tactical Map Inspector');
    expect(html).not.toContain('Plan Assignment');
    expect(html).not.toContain('href="/operator/assignments"');
  });
});
