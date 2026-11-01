'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import type { RescueRequest, UrgencyLevel } from '@floodrelay/shared';
import { apiClient } from '@/lib/api/client';
import type { AssignmentRecord } from '@/lib/api/types';
import LeafletMapWrapper from '@/components/operator/map/LeafletMapWrapper';
import type {
  StagedAsset,
  StagedShelter,
  SelectedMapEntity,
} from '@/components/operator/map/LeafletMapCanvas';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';

// Designated staged sector assets for Harris County Sector 4 (Standby Roster)
const STAGED_SECTOR_FLEET: StagedAsset[] = [
  {
    id: 'res-alpha-4',
    name: 'Boat Alpha-4',
    type: 'BOAT',
    capacity: 6,
    speedKmH: 25,
    lat: 29.7628,
    lng: -95.385,
    status: 'AVAILABLE',
    depotName: 'Buffalo Bayou Staging Depot West',
  },
  {
    id: 'res-bravo-2',
    name: 'Boat Bravo-2',
    type: 'BOAT',
    capacity: 8,
    speedKmH: 22,
    lat: 29.754,
    lng: -95.352,
    status: 'AVAILABLE',
    depotName: 'East River Staging Point',
  },
  {
    id: 'res-truck-heavy',
    name: 'Truck Heavy-2',
    type: 'HIGH_WATER_VEHICLE',
    capacity: 12,
    speedKmH: 45,
    lat: 29.771,
    lng: -95.398,
    status: 'AVAILABLE',
    depotName: 'Heights Emergency Depot',
  },
  {
    id: 'res-hawk-1',
    name: 'Rotary Hawk-1',
    type: 'HELICOPTER',
    capacity: 4,
    speedKmH: 180,
    lat: 29.725,
    lng: -95.34,
    status: 'STANDBY',
    depotName: 'Helipad South Standby',
  },
];

// Designated sector relief shelters
const STAGED_SECTOR_SHELTERS: StagedShelter[] = [
  {
    id: 'shelter-westchase',
    name: 'Westchase High Shelter',
    lat: 29.721,
    lng: -95.558,
    capacity: 350,
    availableBeds: 142,
    status: 'Open — Primary Intake',
  },
  {
    id: 'shelter-nrg',
    name: 'NRG Arena Shelter',
    lat: 29.684,
    lng: -95.411,
    capacity: 800,
    availableBeds: 310,
    status: 'Open — Regional Hub',
  },
];

function OperatorMapContent() {
  const [requests, setRequests] = useState<RescueRequest[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Layers and filters
  const [layers, setLayers] = useState({
    incidents: true,
    craft: true,
    shelters: true,
    routes: true,
  });
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | UrgencyLevel>('ALL');
  const [tileTheme, setTileTheme] = useState<'dark' | 'standard'>('dark');
  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity>(null);

  // Map control trigger for programmatic movement
  const [actionTrigger, setActionTrigger] = useState<{
    type: 'fit' | 'center-critical' | 'zoom-in' | 'zoom-out';
    id: number;
  } | null>(null);

  const triggerAction = (type: 'fit' | 'center-critical' | 'zoom-in' | 'zoom-out') => {
    setActionTrigger({ type, id: Date.now() });
  };

  const toggleLayer = (layer: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Load real backend data
  const loadData = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const [requestsData, assignmentsData] = await Promise.all([
          apiClient.listRequests().catch((err) => {
            console.error('Failed to load requests:', err);
            throw err;
          }),
          apiClient.listAssignments().catch((err) => {
            console.warn('Assignments list empty or unavailable:', err);
            return [] as AssignmentRecord[];
          }),
        ]);

        setRequests(requestsData || []);
        setAssignments(assignmentsData || []);
        if (assignmentsData && assignmentsData.length > 0 && !selectedAssignmentId) {
          setSelectedAssignmentId(assignmentsData[0].id);
        }
        setLastRefreshed(new Date());

        // If no entity currently selected, default to first critical request
        if (requestsData && requestsData.length > 0) {
          const firstCritical =
            requestsData.find((r) => r.urgency === 'CRITICAL') || requestsData[0];
          setSelectedEntity({ type: 'incident', item: firstCritical });
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to load geospatial data from backend');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedAssignmentId],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected assignment record
  const selectedAssignment = useMemo(() => {
    return assignments.find((a) => a.id === selectedAssignmentId) || assignments[0] || null;
  }, [assignments, selectedAssignmentId]);

  // Filtered requests count
  const filteredRequestsCount = useMemo(() => {
    return requests.filter((r) => {
      if (urgencyFilter !== 'ALL' && r.urgency !== urgencyFilter) return false;
      return true;
    }).length;
  }, [requests, urgencyFilter]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] relative overflow-hidden bg-[#0b1320] text-slate-100 select-none">
      {/* Top Banner Notice: Sector Status & Live Timestamp */}
      <div className="bg-slate-900/95 border-b border-slate-700/60 px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs z-30 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-slate-200">Sector 4 Geospatial Tactical Map</span>
          <span className="text-slate-500 hidden sm:inline">•</span>
          <span className="text-slate-400 font-mono text-[11px] hidden md:inline">
            Harris County Basin Grid (29.7604° N, 95.3698° W)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            POSTGIS SNAPSHOT
          </span>
          {lastRefreshed && (
            <span className="text-[11px] text-slate-400 font-mono hidden lg:inline">
              Synced {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
            title="Refresh map data"
            type="button"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin' : ''}`}
            >
              refresh
            </span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-950/80 border-b border-red-800 text-red-200 px-4 py-2 flex items-center justify-between gap-3 text-xs z-30 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400 text-sm">error</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData(false)}
            className="px-2.5 py-1 rounded bg-red-900 hover:bg-red-800 text-white font-bold transition-colors"
            type="button"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Main Map Canvas and Inspector Workspace */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* MAP CANVAS */}
        <div className="flex-1 relative h-full overflow-hidden bg-[#0b1320]">
          {/* Top-left Floating Layer & Filter Controls */}
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 max-w-xl">
            {/* Layer Checkbox Group */}
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-2 rounded-xl shadow-2xl flex items-center gap-2 flex-wrap text-xs">
              {/* Incidents Layer */}
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/40 border border-red-500/40 text-slate-100 cursor-pointer hover:bg-red-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.incidents}
                  onChange={() => toggleLayer('incidents')}
                  className="rounded text-red-500 focus:ring-0 w-3.5 h-3.5 bg-transparent border-red-400 cursor-pointer"
                />
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-medium">Distress Incidents</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded bg-red-600 text-white font-mono text-[10px] font-bold">
                  {filteredRequestsCount}
                </span>
              </label>

              {/* Craft Layer */}
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-teal-950/40 border border-teal-500/40 text-slate-100 cursor-pointer hover:bg-teal-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.craft}
                  onChange={() => toggleLayer('craft')}
                  className="rounded text-teal-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-teal-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[14px] text-teal-400">
                  directions_boat
                </span>
                <span className="font-medium">Staged Fleet</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded bg-teal-700 text-white font-mono text-[10px] font-bold">
                  {STAGED_SECTOR_FLEET.length}
                </span>
              </label>

              {/* Shelters Layer */}
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-500/40 text-slate-100 cursor-pointer hover:bg-emerald-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.shelters}
                  onChange={() => toggleLayer('shelters')}
                  className="rounded text-emerald-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-emerald-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[14px] text-emerald-400">
                  night_shelter
                </span>
                <span className="font-medium">Shelters</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded bg-emerald-700 text-white font-mono text-[10px] font-bold">
                  {STAGED_SECTOR_SHELTERS.length}
                </span>
              </label>

              {/* Assignment Routes Layer */}
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-sky-950/40 border border-sky-500/40 text-slate-100 cursor-pointer hover:bg-sky-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.routes}
                  onChange={() => toggleLayer('routes')}
                  className="rounded text-sky-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-sky-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[14px] text-sky-400">route</span>
                <span className="font-medium">Transit Vectors</span>
              </label>
            </div>

            {/* Filter Dropdowns and Tile Theme */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Urgency Filter */}
              <div className="flex items-center bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs shadow-lg">
                <span className="text-slate-400 mr-1.5 font-mono text-[10px] uppercase font-bold">
                  Urgency:
                </span>
                <select
                  value={urgencyFilter}
                  onChange={(e) => setUrgencyFilter(e.target.value as 'ALL' | UrgencyLevel)}
                  className="bg-transparent text-slate-200 border-0 p-0 pr-4 text-xs font-semibold focus:ring-0 cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-slate-100">
                    All Urgencies ({requests.length})
                  </option>
                  <option value="CRITICAL" className="bg-slate-900 text-slate-100">
                    Critical Only
                  </option>
                  <option value="HIGH" className="bg-slate-900 text-slate-100">
                    High Only
                  </option>
                  <option value="MEDIUM" className="bg-slate-900 text-slate-100">
                    Medium Only
                  </option>
                  <option value="LOW" className="bg-slate-900 text-slate-100">
                    Low Only
                  </option>
                </select>
              </div>

              {/* Tile Style Toggle */}
              <button
                type="button"
                onClick={() => setTileTheme((t) => (t === 'dark' ? 'standard' : 'dark'))}
                className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-300 hover:text-white shadow-lg transition-colors"
                title="Toggle OpenStreetMap Tile Theme"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {tileTheme === 'dark' ? 'dark_mode' : 'light_mode'}
                </span>
                <span className="font-mono text-[10px]">
                  {tileTheme === 'dark' ? 'DARK TACTICAL' : 'STANDARD OSM'}
                </span>
              </button>
            </div>
          </div>

          {/* Top Center Straight-Line Transit Disclaimer */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-md hidden md:block">
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-xl shadow-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-sm flex-shrink-0">
                info
              </span>
              <p className="text-[11px] text-slate-300 leading-tight">
                <strong className="text-amber-300 font-semibold">
                  Straight-line transit vectors shown.
                </strong>{' '}
                Surface road inundation precludes standard routing; watercraft navigate open
                channels. Decision-support interface only.
              </p>
            </div>
          </div>

          {/* Top Right Floating Navigation Tools */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-xl flex flex-col p-1 gap-1">
              <button
                type="button"
                onClick={() => triggerAction('zoom-in')}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 text-slate-200 transition-colors"
                title="Zoom In"
              >
                <span className="material-symbols-outlined text-base">add</span>
              </button>
              <button
                type="button"
                onClick={() => triggerAction('zoom-out')}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 text-slate-200 transition-colors"
                title="Zoom Out"
              >
                <span className="material-symbols-outlined text-base">remove</span>
              </button>
              <div className="h-px bg-slate-700 my-0.5" />
              <button
                type="button"
                onClick={() => triggerAction('center-critical')}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 text-red-400 transition-colors"
                title="Center on Critical Incident"
              >
                <span className="material-symbols-outlined text-base">center_focus_strong</span>
              </button>
              <button
                type="button"
                onClick={() => triggerAction('fit')}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 text-teal-400 transition-colors"
                title="Fit to All Visible Markers"
              >
                <span className="material-symbols-outlined text-base">crop_free</span>
              </button>
            </div>

            {/* Compass HUD */}
            <div className="w-9 h-9 rounded-full bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-xl flex items-center justify-center self-center text-slate-300 font-mono text-[11px] font-bold relative">
              <span className="text-[9px] text-red-400 absolute top-0.5 font-bold">N</span>
              <span className="material-symbols-outlined text-xs rotate-45 text-slate-400">
                navigation
              </span>
            </div>
          </div>

          {/* Floating Map Legend (Bottom-Left) */}
          <div className="absolute bottom-6 left-3 z-20 hidden sm:block">
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-2.5 rounded-xl shadow-xl space-y-1.5 text-[11px]">
              <div className="text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">
                Map Markers Key
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-red-600 border border-red-300 animate-pulse" />
                <span className="text-slate-200">Critical Distress (Pax Count)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-600 border border-amber-300" />
                <span className="text-slate-200">High Urgency Incident</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 border border-yellow-200" />
                <span className="text-slate-200">Moderate / Low Incident</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-teal-600 border border-teal-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[10px] text-white">
                    directions_boat
                  </span>
                </span>
                <span className="text-slate-200">Staged Sector Craft (Standby)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-emerald-700 border border-emerald-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[10px] text-white">
                    night_shelter
                  </span>
                </span>
                <span className="text-slate-200">Designated Relief Shelter</span>
              </div>
            </div>
          </div>

          {/* REAL LEAFLET MAP WRAPPER */}
          <LeafletMapWrapper
            requests={requests}
            stagedFleet={STAGED_SECTOR_FLEET}
            stagedShelters={STAGED_SECTOR_SHELTERS}
            selectedAssignment={selectedAssignment}
            layers={layers}
            urgencyFilter={urgencyFilter}
            selectedEntity={selectedEntity}
            onSelectEntity={setSelectedEntity}
            tileTheme={tileTheme}
            actionTrigger={actionTrigger}
          />
        </div>

        {/* ========================================================================= */}
        {/* 2. SELECTED ENTITY DETAIL INSPECTOR PANEL                                 */}
        {/* ========================================================================= */}
        <aside
          className={`w-full lg:w-96 bg-surface-container-lowest border-l border-outline-variant shadow-2xl z-20 flex flex-col justify-between overflow-y-auto transition-transform duration-300 ${
            selectedEntity
              ? 'translate-y-0 lg:translate-x-0'
              : 'translate-y-full lg:translate-x-full'
          } fixed lg:static bottom-0 right-0 max-h-[85vh] lg:max-h-full`}
        >
          {selectedEntity ? (
            <div className="p-5 space-y-4 text-xs">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                <div>
                  <span className="font-mono text-[10px] uppercase font-bold text-primary block">
                    {selectedEntity.type === 'incident'
                      ? 'DISTRESS TICKET'
                      : selectedEntity.type === 'craft'
                        ? 'SECTOR CRAFT ASSET'
                        : 'RELIEF FACILITY'}
                  </span>
                  <h3 className="font-mono text-base font-bold text-on-surface">
                    {'id' in selectedEntity.item ? selectedEntity.item.id : 'Selected Asset'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntity(null)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                  title="Close Inspector"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* ------------------ INCIDENT DETAILS ------------------ */}
              {selectedEntity.type === 'incident' && (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <UrgencyBadge urgency={selectedEntity.item.urgency} />
                    <StatusBadge status={selectedEntity.item.status || 'PENDING'} />
                    {selectedEntity.item.medicalNeeds && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-900 font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">
                          medical_services
                        </span>
                        Medical Assistance Required
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                      <span className="text-[10px] text-on-surface-variant block">
                        Headcount Awaiting Rescue
                      </span>
                      <span className="font-bold text-on-surface text-base">
                        {selectedEntity.item.peopleCount} Passengers
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                      <span className="text-[10px] text-on-surface-variant block">
                        Intake Source
                      </span>
                      <span className="font-mono font-bold text-on-surface text-xs">
                        {selectedEntity.item.source || 'REPORTED'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-1">
                      Precise Geographic Coordinates
                    </span>
                    <div className="p-2 rounded-lg bg-surface font-mono text-on-surface border border-outline-variant/40 flex items-center justify-between">
                      <span>
                        {selectedEntity.item.lat.toFixed(6)}° N,{' '}
                        {selectedEntity.item.lng.toFixed(6)}° W
                      </span>
                      <span className="material-symbols-outlined text-primary text-base">
                        pin_drop
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-1">
                      Caller Situation &amp; Notes
                    </span>
                    <p className="p-3 rounded-lg bg-surface border border-outline-variant/40 text-on-surface leading-relaxed">
                      {selectedEntity.item.notes || 'No specific caller instructions logged.'}
                    </p>
                  </div>

                  {selectedEntity.item.isFlaggedDuplicate && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950">
                      <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-800">
                        <span className="material-symbols-outlined text-[16px]">warning</span>
                        <span>Potential Duplicate Report</span>
                      </div>
                      <p className="text-[11px] mt-1 text-amber-900">
                        Proximity match with ticket #
                        {selectedEntity.item.duplicateOfId || 'associated ticket'}.
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-1">
                      Logged Timestamp
                    </span>
                    <div className="p-2 rounded bg-surface font-mono text-on-surface text-[11px] border border-outline-variant/40">
                      {selectedEntity.item.createdAt
                        ? new Date(selectedEntity.item.createdAt).toLocaleString()
                        : 'Unknown'}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------ CRAFT DETAILS ------------------ */}
              {selectedEntity.type === 'craft' && (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-950">
                    <div className="font-bold text-xs text-teal-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">directions_boat</span>
                      <span>{selectedEntity.item.name}</span>
                    </div>
                    <div className="text-[11px] text-teal-800 mt-0.5">
                      Stationary Staged Asset • Sector 4 Basin Standby
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                      <span className="text-[10px] text-on-surface-variant block">
                        Passenger Cap
                      </span>
                      <span className="font-bold text-on-surface text-base">
                        {selectedEntity.item.capacity} Pax
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                      <span className="text-[10px] text-on-surface-variant block">
                        Max Transit Speed
                      </span>
                      <span className="font-bold text-on-surface text-base">
                        {selectedEntity.item.speedKmH} km/h
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-1">
                      Staging Depot Location
                    </span>
                    <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/40 text-on-surface">
                      <div className="font-semibold">{selectedEntity.item.depotName}</div>
                      <div className="font-mono text-[11px] text-on-surface-variant mt-0.5">
                        {selectedEntity.item.lat.toFixed(4)}° N,{' '}
                        {selectedEntity.item.lng.toFixed(4)}° W
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant text-[11px] text-on-surface-variant">
                    <span className="font-bold block text-on-surface">Provenance Notice:</span>
                    <span>
                      Staged sector asset inventory. Real-time GPS vessel transponders connect
                      during active deployment in Milestone 5.
                    </span>
                  </div>
                </div>
              )}

              {/* ------------------ SHELTER DETAILS ------------------ */}
              {selectedEntity.type === 'shelter' && (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
                    <div className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">night_shelter</span>
                      <span>{selectedEntity.item.name}</span>
                    </div>
                    <div className="text-[11px] text-emerald-800 mt-0.5">
                      {selectedEntity.item.status}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                      <span className="text-[10px] text-on-surface-variant block">
                        Available Beds
                      </span>
                      <span className="font-bold text-emerald-700 text-base">
                        {selectedEntity.item.availableBeds} Beds
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                      <span className="text-[10px] text-on-surface-variant block">
                        Total Capacity
                      </span>
                      <span className="font-bold text-on-surface text-base">
                        {selectedEntity.item.capacity} Beds
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-1">
                      Shelter Coordinates
                    </span>
                    <div className="p-2 rounded bg-surface font-mono text-on-surface text-[11px] border border-outline-variant/40">
                      {selectedEntity.item.lat.toFixed(6)}° N, {selectedEntity.item.lng.toFixed(6)}°
                      W
                    </div>
                  </div>
                </div>
              )}

              {/* Milestone 5 Disabled Action Strip */}
              <div className="pt-3 border-t border-outline-variant space-y-2">
                <div className="p-2 rounded bg-surface-container border border-outline-variant text-[11px] text-on-surface-variant">
                  <span className="font-bold text-on-surface block">
                    Dispatch Mutation Disabled:
                  </span>
                  <span>
                    Human-supervised solver route generation and craft assignment will be enabled in
                    Milestone 5.
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="py-2 px-3 rounded bg-surface-container text-on-surface text-xs font-semibold opacity-60 cursor-not-allowed"
                    disabled
                    type="button"
                  >
                    Assign Vehicle (M5)
                  </button>
                  <button
                    className="py-2 px-3 rounded bg-primary text-on-primary text-xs font-semibold opacity-60 cursor-not-allowed"
                    disabled
                    type="button"
                  >
                    Dispatch Craft (M5)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-on-surface-variant text-xs space-y-2 my-auto">
              <span className="material-symbols-outlined text-4xl text-outline">
                location_searching
              </span>
              <p className="font-bold text-on-surface">Tactical Map Inspector</p>
              <p className="text-[11px]">
                Click any distress ticket, rescue craft, or shelter marker on the map to inspect
                full telemetry and caller records.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function OperatorMapPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b1320] flex items-center justify-center text-teal-400 font-mono text-xs">
          Loading Operations GIS Canvas...
        </div>
      }
    >
      <OperatorMapContent />
    </Suspense>
  );
}
