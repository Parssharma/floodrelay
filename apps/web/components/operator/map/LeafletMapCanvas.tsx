'use client';

import React, { useEffect, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import type { RescueRequest } from '@floodrelay/shared';
import type { AssignmentRecord, RouteStop } from '@/lib/api/types';

export interface StagedAsset {
  id: string;
  name: string;
  type: 'BOAT' | 'HIGH_WATER_VEHICLE' | 'HELICOPTER';
  capacity: number;
  speedKmH: number;
  lat: number;
  lng: number;
  status: 'AVAILABLE' | 'ASSIGNED' | 'STANDBY';
  depotName: string;
}

export interface StagedShelter {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  availableBeds: number;
  status: string;
}

export type SelectedMapEntity =
  | { type: 'incident'; item: RescueRequest }
  | { type: 'craft'; item: StagedAsset }
  | { type: 'shelter'; item: StagedShelter }
  | null;

interface LeafletMapCanvasProps {
  requests: RescueRequest[];
  stagedFleet: StagedAsset[];
  stagedShelters: StagedShelter[];
  selectedAssignment: AssignmentRecord | null;
  layers: {
    incidents: boolean;
    craft: boolean;
    shelters: boolean;
    routes: boolean;
  };
  urgencyFilter: string;
  selectedEntity: SelectedMapEntity;
  onSelectEntity: (entity: SelectedMapEntity) => void;
  tileTheme: 'dark' | 'standard';
  actionTrigger?: { type: 'fit' | 'center-critical' | 'zoom-in' | 'zoom-out'; id: number } | null;
}

// Marker icon generators
function getIncidentIcon(urgency: string, peopleCount: number, isSelected: boolean): L.DivIcon {
  const isCritical = urgency === 'CRITICAL';
  const isHigh = urgency === 'HIGH';
  const isMedium = urgency === 'MEDIUM';

  const colorClass = isCritical
    ? 'bg-red-600 border-red-300 text-white'
    : isHigh
      ? 'bg-amber-600 border-amber-300 text-white'
      : isMedium
        ? 'bg-yellow-500 border-yellow-200 text-slate-950 font-black'
        : 'bg-sky-600 border-sky-300 text-white';

  const pulseRing = isCritical
    ? '<span class="absolute -inset-1 rounded-full bg-red-500 animate-ping opacity-60"></span>'
    : '';
  const selectedRing = isSelected
    ? 'ring-4 ring-teal-400 ring-offset-2 ring-offset-slate-900 scale-125 z-50'
    : '';

  const html = `
    <div class="relative flex items-center justify-center cursor-pointer transition-transform duration-150">
      ${pulseRing}
      <div class="relative flex items-center justify-center w-7 h-7 rounded-full border-2 font-mono font-bold text-xs shadow-xl ${colorClass} ${selectedRing}">
        ${peopleCount}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-incident-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function getCraftIcon(name: string, isSelected: boolean): L.DivIcon {
  const selectedRing = isSelected
    ? 'ring-4 ring-teal-400 ring-offset-2 ring-offset-slate-900 scale-110'
    : '';
  const html = `
    <div class="flex flex-col items-center cursor-pointer transition-transform duration-150">
      <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-700 border-2 border-teal-300 text-white shadow-xl ${selectedRing}">
        <span class="material-symbols-outlined text-[16px]">directions_boat</span>
      </div>
      <div class="px-1.5 py-0.2 rounded bg-slate-950/95 border border-teal-500/60 text-[10px] text-teal-300 font-mono font-bold whitespace-nowrap mt-0.5 shadow-md">
        ${name}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-craft-marker',
    iconSize: [48, 44],
    iconAnchor: [24, 14],
    popupAnchor: [0, -14],
  });
}

function getShelterIcon(name: string, isSelected: boolean): L.DivIcon {
  const selectedRing = isSelected
    ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-slate-900 scale-110'
    : '';
  const html = `
    <div class="flex flex-col items-center cursor-pointer transition-transform duration-150">
      <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-800 border-2 border-emerald-300 text-white shadow-xl ${selectedRing}">
        <span class="material-symbols-outlined text-[16px]">night_shelter</span>
      </div>
      <div class="px-1.5 py-0.2 rounded bg-slate-950/95 border border-emerald-500/60 text-[10px] text-emerald-300 font-mono font-bold whitespace-nowrap mt-0.5 shadow-md">
        ${name}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-shelter-marker',
    iconSize: [48, 44],
    iconAnchor: [24, 14],
    popupAnchor: [0, -14],
  });
}

// Controller component for programmatic map viewport movements
function MapMovementController({
  allCoordinates,
  selectedEntity,
  actionTrigger,
}: {
  allCoordinates: [number, number][];
  selectedEntity: SelectedMapEntity;
  actionTrigger?: { type: 'fit' | 'center-critical' | 'zoom-in' | 'zoom-out'; id: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!actionTrigger) return;

    if (actionTrigger.type === 'fit' && allCoordinates.length > 0) {
      const bounds = L.latLngBounds(allCoordinates.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else if (actionTrigger.type === 'center-critical') {
      const criticalCoords = allCoordinates[0];
      if (criticalCoords) {
        map.setView(criticalCoords, 14, { animate: true });
      }
    } else if (actionTrigger.type === 'zoom-in') {
      map.zoomIn();
    } else if (actionTrigger.type === 'zoom-out') {
      map.zoomOut();
    }
  }, [actionTrigger, allCoordinates, map]);

  useEffect(() => {
    if (selectedEntity) {
      const target = selectedEntity.item;
      if (
        'lat' in target &&
        'lng' in target &&
        typeof target.lat === 'number' &&
        typeof target.lng === 'number'
      ) {
        map.panTo([target.lat, target.lng], { animate: true });
      }
    }
  }, [selectedEntity, map]);

  return null;
}

export default function LeafletMapCanvas({
  requests,
  stagedFleet,
  stagedShelters,
  selectedAssignment,
  layers,
  urgencyFilter,
  selectedEntity,
  onSelectEntity,
  tileTheme,
  actionTrigger,
}: LeafletMapCanvasProps) {
  // Validate and filter incident requests by urgency
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number' || isNaN(r.lat) || isNaN(r.lng)) {
        return false;
      }
      if (r.lat < -90 || r.lat > 90 || r.lng < -180 || r.lng > 180) {
        return false;
      }
      if (urgencyFilter !== 'ALL' && r.urgency !== urgencyFilter) {
        return false;
      }
      return true;
    });
  }, [requests, urgencyFilter]);

  // Aggregate all visible coordinates for bounds fitting
  const allCoordinates: [number, number][] = useMemo(() => {
    const coords: [number, number][] = [];
    if (layers.incidents) {
      filteredRequests.forEach((r) => coords.push([r.lat, r.lng]));
    }
    if (layers.craft) {
      stagedFleet.forEach((f) => coords.push([f.lat, f.lng]));
    }
    if (layers.shelters) {
      stagedShelters.forEach((s) => coords.push([s.lat, s.lng]));
    }
    return coords;
  }, [filteredRequests, stagedFleet, stagedShelters, layers]);

  // Default center: Houston Buffalo Bayou Basin
  const defaultCenter: [number, number] = [29.7604, -95.3698];

  // Tile layer configuration
  const tileUrl =
    tileTheme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const tileAttribution =
    tileTheme === 'dark'
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  // Assignment polyline vectors
  const routePolylines = useMemo(() => {
    if (!layers.routes || !selectedAssignment?.routes) return [];

    return selectedAssignment.routes.map((route) => {
      const latlngs: [number, number][] = route.stops
        .filter((s: RouteStop) => typeof s.lat === 'number' && typeof s.lng === 'number')
        .map((s: RouteStop) => [s.lat, s.lng]);

      return {
        resourceId: route.resourceId,
        latlngs,
      };
    });
  }, [layers.routes, selectedAssignment]);

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%', backgroundColor: '#0b1320' }}
        zoomControl={false}
      >
        <TileLayer attribution={tileAttribution} url={tileUrl} maxZoom={19} />

        <MapMovementController
          allCoordinates={allCoordinates}
          selectedEntity={selectedEntity}
          actionTrigger={actionTrigger}
        />

        {/* 1. INCIDENT MARKERS */}
        {layers.incidents &&
          filteredRequests.map((req) => {
            const isSelected =
              selectedEntity?.type === 'incident' && selectedEntity.item.id === req.id;
            return (
              <Marker
                key={req.id}
                position={[req.lat, req.lng]}
                icon={getIncidentIcon(req.urgency, req.peopleCount, isSelected)}
                eventHandlers={{
                  click: () => onSelectEntity({ type: 'incident', item: req }),
                }}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="text-xs p-1 space-y-1">
                    <div className="font-mono font-bold text-on-surface">{req.id}</div>
                    <div className="text-[11px] font-semibold text-tertiary">
                      {req.urgency} Priority • {req.peopleCount} Pax
                    </div>
                    <div className="text-[10px] text-on-surface-variant line-clamp-2">
                      {req.notes || 'No caller notes'}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* 2. STAGED CRAFT MARKERS */}
        {layers.craft &&
          stagedFleet.map((craft) => {
            const isSelected =
              selectedEntity?.type === 'craft' && selectedEntity.item.id === craft.id;
            return (
              <Marker
                key={craft.id}
                position={[craft.lat, craft.lng]}
                icon={getCraftIcon(craft.name, isSelected)}
                eventHandlers={{
                  click: () => onSelectEntity({ type: 'craft', item: craft }),
                }}
              >
                <Popup>
                  <div className="text-xs p-1 space-y-1">
                    <div className="font-bold text-on-surface">{craft.name}</div>
                    <div className="text-[11px] text-primary">Staged Standby Unit</div>
                    <div className="text-[10px] text-on-surface-variant">
                      Cap: {craft.capacity} pax • Depot: {craft.depotName}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* 3. SHELTER MARKERS */}
        {layers.shelters &&
          stagedShelters.map((shelter) => {
            const isSelected =
              selectedEntity?.type === 'shelter' && selectedEntity.item.id === shelter.id;
            return (
              <Marker
                key={shelter.id}
                position={[shelter.lat, shelter.lng]}
                icon={getShelterIcon(shelter.name, isSelected)}
                eventHandlers={{
                  click: () => onSelectEntity({ type: 'shelter', item: shelter }),
                }}
              >
                <Popup>
                  <div className="text-xs p-1 space-y-1">
                    <div className="font-bold text-on-surface">{shelter.name}</div>
                    <div className="text-[11px] text-emerald-700 font-semibold">
                      {shelter.status}
                    </div>
                    <div className="text-[10px] text-on-surface-variant">
                      {shelter.availableBeds} / {shelter.capacity} Beds Available
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* 4. ASSIGNMENT ROUTE POLYLINES */}
        {layers.routes &&
          routePolylines.map((route, idx) => (
            <Polyline
              key={`${route.resourceId}-${idx}`}
              positions={route.latlngs}
              pathOptions={{
                color: '#14b8a6',
                weight: 3,
                dashArray: '6, 8',
                opacity: 0.85,
              }}
            />
          ))}
      </MapContainer>
    </div>
  );
}
