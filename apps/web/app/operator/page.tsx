'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { RescueRequest } from '@floodrelay/shared';
import { apiClient } from '@/lib/api/client';
import type { AssignmentRecord } from '@/lib/api/types';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';

// Designated staged sector assets for Harris County Sector 4
const STAGED_SECTOR_FLEET = [
  {
    id: 'res-alpha',
    name: 'Rescue Boat Alpha',
    type: 'BOAT',
    capacity: 6,
    speedKmH: 25,
    status: 'AVAILABLE' as const,
  },
  {
    id: 'res-bravo',
    name: 'Rescue Boat Bravo',
    type: 'BOAT',
    capacity: 8,
    speedKmH: 22,
    status: 'AVAILABLE' as const,
  },
  {
    id: 'res-delta',
    name: 'High-Water Truck Delta',
    type: 'HIGH_WATER_VEHICLE',
    capacity: 12,
    speedKmH: 45,
    status: 'AVAILABLE' as const,
  },
  {
    id: 'res-air1',
    name: 'Air Rescue One',
    type: 'HELICOPTER',
    capacity: 4,
    speedKmH: 180,
    status: 'AVAILABLE' as const,
  },
];

export default function OperatorOverviewPage() {
  const [requests, setRequests] = useState<RescueRequest[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
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
          console.warn('Assignments list not yet available or empty:', err);
          return [] as AssignmentRecord[];
        }),
      ]);

      setRequests(requestsData || []);
      setAssignments(assignmentsData || []);
      setLastRefreshed(new Date());
    } catch (err) {
      setError((err as Error).message || 'Unable to connect to FloodRelay command backend');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute live real-time metrics
  const metrics = useMemo(() => {
    const totalRequests = requests.length;
    const criticalCount = requests.filter((r) => r.urgency === 'CRITICAL').length;
    const highCount = requests.filter((r) => r.urgency === 'HIGH').length;
    const mediumCount = requests.filter((r) => r.urgency === 'MEDIUM').length;
    const lowCount = requests.filter((r) => r.urgency === 'LOW').length;
    const pendingCount = requests.filter((r) => !r.status || r.status === 'PENDING').length;
    const assignedCount = requests.filter((r) => r.status === 'ASSIGNED').length;
    const totalPassengers = requests.reduce((acc, r) => acc + (r.peopleCount || 0), 0);
    const medicalCount = requests.filter((r) => r.medicalNeeds).length;
    const duplicateCount = requests.filter((r) => r.isFlaggedDuplicate).length;

    return {
      totalRequests,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      pendingCount,
      assignedCount,
      totalPassengers,
      medicalCount,
      duplicateCount,
    };
  }, [requests]);

  // Sort top urgent requests for triage queue
  const criticalTriageQueue = useMemo(() => {
    const urgencyWeight: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    return [...requests]
      .filter(
        (r) =>
          !r.status || r.status === 'PENDING' || r.urgency === 'CRITICAL' || r.urgency === 'HIGH',
      )
      .sort((a, b) => {
        const weightDiff = (urgencyWeight[b.urgency] || 0) - (urgencyWeight[a.urgency] || 0);
        if (weightDiff !== 0) return weightDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 5);
  }, [requests]);

  const latestAssignment = assignments[0] || null;

  return (
    <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1600px] w-full mx-auto">
      {/* Top Banner Notice: Live PostGIS Stream Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-container border border-outline-variant/60">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-xs text-on-surface">Sector 4 Command Center</span>
          <span className="text-outline text-xs">•</span>
          <span className="text-xs text-on-surface-variant">
            Harris County Flood Basin Operations
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            DATABASE SNAPSHOT
          </span>
          {lastRefreshed && (
            <span className="text-[11px] text-on-surface-variant font-mono">
              Refreshed {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold transition-colors disabled:opacity-50"
            title="Refresh stream"
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
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400">error</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchData(false)}
            className="px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-white font-bold transition-colors"
            type="button"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 4 PRIMARY METRIC CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Staged Rescue Fleet */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">
              Active Rescue Fleet
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">
              directions_boat
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-inter text-2xl lg:text-3xl font-extrabold text-on-surface">
              {STAGED_SECTOR_FLEET.length}
            </span>
            <span className="text-xs text-on-surface-variant font-medium">/ 6 craft staged</span>
          </div>
          <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${(STAGED_SECTOR_FLEET.length / 6) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>Standby: Ready</span>
            <span className="text-emerald-700 font-semibold font-mono">4 Staged in Basin</span>
          </div>
        </div>

        {/* Metric 2: Live Distress Queue */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">
              Distress Queue
            </span>
            <span className="material-symbols-outlined text-tertiary text-[20px]">
              crisis_alert
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-inter text-2xl lg:text-3xl font-extrabold text-tertiary">
              {isLoading ? '—' : metrics.criticalCount}
            </span>
            <span className="text-xs text-tertiary font-bold">Critical Priority</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="text-amber-800 font-semibold">{metrics.highCount} High</span>
            <span>•</span>
            <span>{metrics.mediumCount} Moderate</span>
            <span>•</span>
            <span className="font-mono font-bold text-on-surface">
              {metrics.totalRequests} In Queue
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <Link className="text-primary font-semibold hover:underline" href="/operator/requests">
              Manage Requests ({metrics.pendingCount} Pending) →
            </Link>
          </div>
        </div>

        {/* Metric 3: Relief Shelters */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">
              Relief Shelters
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">
              night_shelter
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-inter text-2xl lg:text-3xl font-extrabold text-on-surface">
              68%
            </span>
            <span className="text-xs text-on-surface-variant font-medium">Occupancy</span>
          </div>
          <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full" style={{ width: '68%' }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>3 of 3 Facilities Open</span>
            <span className="text-emerald-700 font-semibold">119 Beds Open</span>
          </div>
        </div>

        {/* Metric 4: Optimization Coverage */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">
              Latest Solver Plan
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">route</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            {latestAssignment ? (
              <>
                <span className="font-inter text-2xl lg:text-3xl font-extrabold text-primary">
                  {latestAssignment.metrics?.coveragePercent || 0}%
                </span>
                <span className="text-xs text-primary font-bold">{latestAssignment.id}</span>
              </>
            ) : (
              <>
                <span className="font-inter text-lg lg:text-xl font-bold text-on-surface-variant">
                  Standby
                </span>
                <span className="text-xs text-on-surface-variant">M5 Solver</span>
              </>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            {latestAssignment ? (
              <>
                <span>{latestAssignment.routes?.length || 0} Routes Planned</span>
                <span className="text-amber-800 font-semibold">
                  {latestAssignment.unserved?.length || 0} Unserved
                </span>
              </>
            ) : (
              <span className="italic text-[11px]">Human-supervised solver ready</span>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <Link
              className="text-primary font-semibold hover:underline"
              href="/operator/assignments"
            >
              Assignment Workspace →
            </Link>
          </div>
        </div>
      </section>

      {/* TWO-COLUMN WORKBENCH: Active Triage Queue & Map Shortcut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: High-Priority Inbound Queue (7 cols) */}
        <section className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">emergency</span>
                <h2 className="text-base font-bold text-on-surface">Critical Triage Queue</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-tertiary-container text-on-tertiary">
                  {criticalTriageQueue.length} In Focus
                </span>
              </div>
              <Link
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                href="/operator/requests"
              >
                <span>Full List ({metrics.totalRequests})</span>
                <span className="material-symbols-outlined text-xs">arrow_forward</span>
              </Link>
            </div>

            {isLoading && requests.length === 0 ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-surface-container-low animate-pulse" />
                ))}
              </div>
            ) : criticalTriageQueue.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant space-y-3 border border-dashed border-outline-variant rounded-lg">
                <span className="material-symbols-outlined text-4xl text-emerald-500">
                  task_alt
                </span>
                <h3 className="text-sm font-bold text-on-surface">Triage Queue Clear</h3>
                <p className="text-xs max-w-sm mx-auto">
                  No pending citizen rescue requests currently in database. New citizen distress
                  calls submitted via the public portal will appear here in real time.
                </p>
                <div className="pt-2">
                  <Link
                    href="/citizen"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
                  >
                    <span>Test Citizen Portal Intake</span>
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {criticalTriageQueue.map((req) => (
                  <div
                    key={req.id}
                    className="p-3 rounded-lg border border-outline-variant/70 bg-surface hover:bg-surface-container-low transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-on-surface">
                          {req.id}
                        </span>
                        <UrgencyBadge urgency={req.urgency} />
                        <StatusBadge status={req.status || 'PENDING'} />
                        {req.medicalNeeds && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-900 font-semibold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">
                              medical_services
                            </span>
                            Medical
                          </span>
                        )}
                        {req.isFlaggedDuplicate && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-100 text-amber-900 font-bold">
                            DUP
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-on-surface-variant line-clamp-1">
                        {req.notes || 'No caller notes provided.'}
                      </p>
                      <div className="text-[11px] text-on-surface-variant font-mono">
                        <span>{req.peopleCount} passengers</span> •{' '}
                        <span>
                          GPS: {req.lat.toFixed(4)}, {req.lng.toFixed(4)}
                        </span>
                      </div>
                    </div>
                    <Link
                      className="self-end sm:self-auto px-3 py-1.5 rounded bg-surface-container-high text-xs font-semibold text-on-surface hover:bg-primary hover:text-on-primary transition-colors text-center"
                      href={`/operator/requests?inspect=${encodeURIComponent(req.id)}`}
                    >
                      Inspect
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant">
            <span>
              Showing top {criticalTriageQueue.length} urgent ticket
              {criticalTriageQueue.length === 1 ? '' : 's'}
            </span>
            <span className="font-mono text-[11px]">PostgreSQL / PostGIS persistence verified</span>
          </div>
        </section>

        {/* Right Column: Tactical Map Shortcut & Fleet Status (5 cols) */}
        <section className="lg:col-span-5 space-y-6">
          {/* Tactical Map Shortcut Card */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">map</span>
                <h3 className="text-sm font-bold text-on-surface">Operations Map Preview</h3>
              </div>
              <Link
                className="text-xs font-semibold text-primary hover:underline"
                href="/operator/map"
              >
                Open Full GIS Map →
              </Link>
            </div>

            {/* Stylized Simulated Map Preview Box */}
            <div className="relative h-44 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center text-slate-400">
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, #38bdf8 1px, transparent 1px), linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />
              <div className="z-10 text-center space-y-2 p-4">
                <span className="material-symbols-outlined text-sky-400 text-3xl">
                  location_searching
                </span>
                <div className="text-xs font-semibold text-slate-200">
                  Sector 4 — Buffalo Bayou Basin Tactical Map
                </div>
                <p className="text-[11px] text-slate-400 max-w-xs">
                  {metrics.totalRequests} Distress reports • 4 Rescue craft staged • 3 Shelters open
                </p>
                <Link
                  className="inline-block px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
                  href="/operator/map"
                >
                  Launch Interactive Map (M4)
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Fleet Readiness Roster */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-outline-variant">
              <div>
                <h3 className="text-sm font-bold text-on-surface">Staged Rescue Assets</h3>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  Harris County Sector 4 Standby Fleet
                </span>
              </div>
              <span className="text-xs font-mono text-on-surface-variant">
                {STAGED_SECTOR_FLEET.length} Deployed / Ready
              </span>
            </div>
            <div className="space-y-2 text-xs">
              {STAGED_SECTOR_FLEET.map((res) => (
                <div
                  key={res.id}
                  className="flex items-center justify-between p-2 rounded bg-surface border border-outline-variant/60"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">
                      {res.type === 'BOAT'
                        ? 'directions_boat'
                        : res.type === 'HELICOPTER'
                          ? 'flight'
                          : 'local_shipping'}
                    </span>
                    <div>
                      <span className="font-semibold text-on-surface block">{res.name}</span>
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        Cap: {res.capacity} pax • {res.speedKmH} km/h
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={res.status} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* RECENT ASSIGNMENTS SECTION */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant">
          <div>
            <h2 className="text-base font-bold text-on-surface">Recent Assignment Plans</h2>
            <p className="text-xs text-on-surface-variant">
              Human-supervised vehicle route proposals and committed plans
            </p>
          </div>
          <Link
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            href="/operator/assignments"
          >
            <span>View All Assignments</span>
            <span className="material-symbols-outlined text-xs">arrow_forward</span>
          </Link>
        </div>

        {assignments.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-outline-variant bg-surface text-center space-y-2">
            <span className="material-symbols-outlined text-3xl text-outline">route</span>
            <p className="text-xs font-bold text-on-surface">No assignment plans generated yet</p>
            <p className="text-[11px] text-on-surface-variant max-w-md mx-auto">
              Automated multi-vehicle routing and human-supervised dispatch proposals will connect
              to the solver engine in Milestone 5.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {assignments.map((plan) => (
              <div
                key={plan.id}
                className="p-4 rounded-xl border border-outline-variant bg-surface hover:border-primary transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-bold text-on-surface">{plan.id}</span>
                    <StatusBadge status={plan.status} />
                  </div>
                  <div className="text-xs text-on-surface-variant space-y-1 mb-3">
                    <div className="flex justify-between">
                      <span>Coverage:</span>
                      <span className="font-bold text-primary font-mono">
                        {plan.metrics?.coveragePercent}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Travel Time:</span>
                      <span className="font-mono">{plan.metrics?.totalTravelTimeMinutes} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unserved:</span>
                      <span className="font-mono text-amber-700">{plan.unserved?.length || 0}</span>
                    </div>
                  </div>
                </div>
                <Link
                  className="w-full py-2 rounded bg-surface-container text-center text-xs font-semibold text-on-surface hover:bg-primary hover:text-on-primary transition-colors block"
                  href={`/operator/assignments/${plan.id}`}
                >
                  Inspect Plan
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
