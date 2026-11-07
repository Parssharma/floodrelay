'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import type { UrgencyLevel } from '@floodrelay/shared';
import LeafletMapWrapper from '@/components/operator/map/LeafletMapWrapper';
import type { SelectedMapEntity, MapLayers } from '@/components/operator/map/LeafletMapCanvas';
import { MapInspectorDrawer } from '@/components/operator/map/MapInspectorDrawer';
import { useLiveRequests } from '@/hooks/useLiveRequests';
import { useLiveAssignments } from '@/hooks/useLiveAssignments';
import { useFloodForecast } from '@/hooks/useFloodForecast';
import { LiveStatusIndicator } from '@/components/operator/LiveStatusIndicator';
import type { LivePollingStatus } from '@/hooks/useLivePolling';
import { SIMULATED_REPAIR_RESULT } from '@/lib/fixtures/repairFixtures';
import {
  STAGED_SECTOR_FLEET,
  STAGED_SECTOR_SHELTERS,
  STAGED_SECTOR_BLOCKED_ZONES,
  MAP_SCENARIO_NAME,
  MAP_SCENARIO_COORDINATES,
  rebaseLatLng,
} from '@/lib/fixtures/mapReferenceData';

function OperatorMapContent() {
  // Live polling for requests and assignments
  const {
    data: requests = [],
    status: requestsStatus,
    lastUpdated: requestsUpdated,
    isRefreshing: requestsRefreshing,
    refresh: refreshRequests,
  } = useLiveRequests({ intervalMs: 20000 });

  const {
    data: assignments = [],
    status: assignmentsStatus,
    lastUpdated: assignmentsUpdated,
    isRefreshing: assignmentsRefreshing,
    refresh: refreshAssignments,
  } = useLiveAssignments({ intervalMs: 20000 });

  const {
    data: forecastContext,
    status: forecastStatus,
    error: forecastError,
  } = useFloodForecast();

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');

  // Sync selected assignment
  useEffect(() => {
    if (assignments.length > 0 && !selectedAssignmentId) {
      setSelectedAssignmentId(assignments[0].id);
    }
  }, [assignments, selectedAssignmentId]);

  // Aggregate live status
  const liveStatus: LivePollingStatus =
    requestsStatus === 'OFFLINE' || assignmentsStatus === 'OFFLINE'
      ? 'OFFLINE'
      : requestsStatus === 'UNAUTHORIZED' || assignmentsStatus === 'UNAUTHORIZED'
        ? 'UNAUTHORIZED'
        : requestsStatus === 'FORBIDDEN' || assignmentsStatus === 'FORBIDDEN'
          ? 'FORBIDDEN'
          : requestsStatus === 'REFRESHING' || assignmentsStatus === 'REFRESHING'
            ? 'REFRESHING'
            : requestsStatus === 'STALE' || assignmentsStatus === 'STALE'
              ? 'STALE'
              : requestsStatus === 'INITIAL_LOADING' || assignmentsStatus === 'INITIAL_LOADING'
                ? 'INITIAL_LOADING'
                : 'UP_TO_DATE';

  const lastUpdated = requestsUpdated || assignmentsUpdated;
  const isRefreshing = requestsRefreshing || assignmentsRefreshing;

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshRequests(), refreshAssignments()]);
  }, [refreshRequests, refreshAssignments]);

  // Layers and filters
  const [layers, setLayers] = useState<MapLayers>({
    incidents: true,
    craft: true,
    shelters: true,
    routes: true,
    blockages: true,
    repairOverlay: false,
    floodForecast: false,
  });
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | UrgencyLevel>('ALL');
  const [tileTheme, setTileTheme] = useState<'dark' | 'standard'>('dark');
  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity>(null);

  // Set initial selected entity when requests first arrive
  useEffect(() => {
    if (requests.length > 0 && !selectedEntity) {
      const firstCritical = requests.find((r) => r.urgency === 'CRITICAL') || requests[0];
      setSelectedEntity({ type: 'incident', item: firstCritical });
    }
  }, [requests, selectedEntity]);

  // Map control trigger for programmatic movement
  const [actionTrigger, setActionTrigger] = useState<{
    type: 'fit' | 'center-critical' | 'zoom-in' | 'zoom-out';
    id: number;
  } | null>(null);

  const triggerAction = (type: 'fit' | 'center-critical' | 'zoom-in' | 'zoom-out') => {
    setActionTrigger({ type, id: Date.now() });
  };

  const toggleLayer = (layer: keyof MapLayers) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Repair route polyline vectors for comparison overlay (rebased from baseline anchor to Delhi anchor)
  const repairRoutePolylines = useMemo(() => {
    return (
      SIMULATED_REPAIR_RESULT.proposedPlan?.routes.map((r) => ({
        resourceId: r.resourceId,
        latlngs: r.stops.map((s) => rebaseLatLng([s.lat, s.lng])),
      })) || []
    );
  }, []);

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
          <span className="font-semibold text-slate-200">{MAP_SCENARIO_NAME}</span>
          <span className="text-slate-500 hidden sm:inline">•</span>
          <span className="text-slate-400 font-mono text-[11px] hidden md:inline">
            {MAP_SCENARIO_COORDINATES}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE INCIDENTS • REFERENCE FLEET & HAZARDS
          </span>
          <LiveStatusIndicator
            status={liveStatus}
            lastUpdated={lastUpdated}
            onRefresh={refreshAll}
            isRefreshing={isRefreshing}
          />
        </div>
      </div>

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

              {/* Craft Layer (Reference) */}
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
                <span className="font-medium">Reference Fleet (Simulated)</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded bg-teal-700 text-white font-mono text-[10px] font-bold">
                  {STAGED_SECTOR_FLEET.length}
                </span>
              </label>

              {/* Shelters Layer (Reference) */}
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
                <span className="font-medium">Relief Shelters (Reference)</span>
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

              {/* Road Hazard Blockages Layer (Reference) */}
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-rose-950/40 border border-rose-500/40 text-slate-100 cursor-pointer hover:bg-rose-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.blockages}
                  onChange={() => toggleLayer('blockages')}
                  className="rounded text-rose-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-rose-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[14px] text-rose-400">traffic</span>
                <span className="font-medium">Hazard Zones (Reference)</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded bg-rose-700 text-white font-mono text-[10px] font-bold">
                  {STAGED_SECTOR_BLOCKED_ZONES.length}
                </span>
              </label>

              {/* Repair Comparison Overlay */}
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-purple-950/40 border border-purple-500/40 text-slate-100 cursor-pointer hover:bg-purple-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.repairOverlay}
                  onChange={() => toggleLayer('repairOverlay')}
                  className="rounded text-purple-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-purple-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[14px] text-purple-400">
                  alt_route
                </span>
                <span className="font-medium">Repair Overlay</span>
              </label>

              {/* Flood Forecast Context Layer (Phase 6) */}
              <label
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-cyan-950/40 border border-cyan-500/40 text-slate-100 cursor-pointer hover:bg-cyan-900/40 transition-colors"
                data-testid="layer-toggle-forecast"
              >
                <input
                  type="checkbox"
                  checked={layers.floodForecast}
                  onChange={() => toggleLayer('floodForecast')}
                  className="rounded text-cyan-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-cyan-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[14px] text-cyan-400">waves</span>
                <span className="font-medium">Flood Forecast</span>
                {forecastContext && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded bg-cyan-800 text-white font-mono text-[10px] font-bold">
                    {forecastContext.currentDischargeM3S} m³/s
                  </span>
                )}
              </label>
            </div>

            {/* Flood Forecast Information Floating Card */}
            {layers.floodForecast && (
              <div
                className="bg-slate-900/95 backdrop-blur-md border border-cyan-500/60 p-3 rounded-xl shadow-2xl space-y-2 text-xs text-slate-200 animate-in fade-in"
                data-testid="forecast-info-card"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-cyan-400 text-base">waves</span>
                    <span className="font-bold text-slate-100">
                      Yamuna River Discharge Forecast
                    </span>
                  </div>
                  {forecastContext && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-500/50 text-cyan-300">
                      {forecastContext.riskCategory} • {forecastContext.freshness}
                    </span>
                  )}
                </div>

                {forecastStatus === 'ERROR' || (!forecastContext && forecastError) ? (
                  <div className="text-amber-300 text-[11px] bg-amber-950/40 border border-amber-600/40 p-2 rounded">
                    Flood forecast provider temporarily unavailable. Operational rescue map and
                    routing remain fully interactive.
                  </div>
                ) : forecastContext ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                        <div className="text-[10px] text-slate-400 uppercase font-mono">
                          Current Discharge
                        </div>
                        <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
                          {forecastContext.currentDischargeM3S} {forecastContext.variable.unit}
                        </div>
                      </div>
                      <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                        <div className="text-[10px] text-slate-400 uppercase font-mono">
                          7-Day Peak Forecast
                        </div>
                        <div className="text-sm font-bold font-mono text-amber-300 mt-0.5">
                          {forecastContext.peakForecastM3S} {forecastContext.variable.unit}
                        </div>
                      </div>
                    </div>

                    <div className="text-[10.5px] text-slate-400 font-mono">
                      Cell: Lat {forecastContext.region.stationLat.toFixed(3)}°N, Lng{' '}
                      {forecastContext.region.stationLng.toFixed(3)}°E • Issued:{' '}
                      {forecastContext.issuedAt.split('T')[0]}
                    </div>

                    <div className="text-[9.5px] text-slate-400 italic border-t border-slate-800 pt-1 leading-tight">
                      {forecastContext.attribution}. {forecastContext.disclaimer}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 text-[11px]">Loading hydrological context...</div>
                )}
              </div>
            )}

            {/* Simulated Repair Preview Notice Banner */}
            {layers.repairOverlay && (
              <div className="bg-purple-950/90 backdrop-blur-md border border-purple-500/80 p-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs text-purple-200 animate-in fade-in">
                <span className="material-symbols-outlined text-[16px] text-purple-400 shrink-0">
                  alt_route
                </span>
                <div>
                  <span className="font-bold font-mono text-[11px]">
                    [SIMULATED REPAIR PREVIEW — NOT COMMITTED]
                  </span>
                  <span className="text-purple-300/90 text-[11px] block">
                    Displaying synthetic test fixture routes. Map overlay is strictly read-only; no
                    commit action is available.
                  </span>
                </div>
              </div>
            )}

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
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-cyan-600 border border-cyan-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[10px] text-white">waves</span>
                </span>
                <span className="text-slate-200">River Discharge Station (Context)</span>
              </div>
            </div>
          </div>

          {/* REAL LEAFLET MAP WRAPPER */}
          <LeafletMapWrapper
            requests={requests}
            stagedFleet={STAGED_SECTOR_FLEET}
            stagedShelters={STAGED_SECTOR_SHELTERS}
            selectedAssignment={selectedAssignment}
            blockedZones={STAGED_SECTOR_BLOCKED_ZONES}
            repairRoutePolylines={repairRoutePolylines}
            forecastContext={forecastContext}
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
          <MapInspectorDrawer
            selectedEntity={selectedEntity}
            onClose={() => setSelectedEntity(null)}
          />
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
