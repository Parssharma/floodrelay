'use client';

import React from 'react';
import Link from 'next/link';
import { SIMULATED_DASHBOARD_METRICS } from '@/lib/fixtures/metrics';
import { SIMULATED_REQUESTS } from '@/lib/fixtures/requests';
import { SIMULATED_RESOURCES } from '@/lib/fixtures/resources';
import { SIMULATED_ASSIGNMENTS } from '@/lib/fixtures/assignments';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SimulatedNotice } from '@/components/ui/SimulatedNotice';

export default function OperatorOverviewPage() {
  const metrics = SIMULATED_DASHBOARD_METRICS;
  const criticalRequests = SIMULATED_REQUESTS.filter(
    (r) => r.urgency === 'CRITICAL' || r.urgency === 'HIGH',
  ).slice(0, 5);

  return (
    <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1600px] w-full mx-auto">
      {/* Top Banner Notice: Explicit Simulated Disclosure */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-container border border-outline-variant/60">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-xs text-on-surface">Sector 4 Command Center</span>
          <span className="text-outline text-xs">•</span>
          <span className="text-xs text-on-surface-variant">
            Harris County Flood Basin Operations
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SimulatedNotice label="DEMO FIXTURES" />
          <span className="text-[11px] text-on-surface-variant font-mono">
            Simulated data for visual development
          </span>
        </div>
      </div>

      {/* 4 PRIMARY METRIC CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Fleet Utilization */}
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
              {metrics.activeFleetCount}
            </span>
            <span className="text-xs text-on-surface-variant font-medium">
              / {metrics.totalFleetCount} craft
            </span>
          </div>
          <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${(metrics.activeFleetCount / metrics.totalFleetCount) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>Utilization: 81.8%</span>
            <span className="text-emerald-700 font-semibold">4 Units In Reserve</span>
          </div>
        </div>

        {/* Metric 2: Distress Queue */}
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
              {metrics.criticalRequestsCount}
            </span>
            <span className="text-xs text-tertiary font-bold">Critical Priority</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="text-amber-800 font-semibold">{metrics.urgentRequestsCount} High</span>
            <span>•</span>
            <span>{metrics.mediumRequestsCount} Moderate</span>
            <span>•</span>
            <span>37 In Queue</span>
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <Link className="text-primary font-semibold hover:underline" href="/operator/requests">
              View All Requests →
            </Link>
          </div>
        </div>

        {/* Metric 3: Shelter Capacity */}
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
              {metrics.shelterCapacityPercent}%
            </span>
            <span className="text-xs text-on-surface-variant font-medium">Occupancy</span>
          </div>
          <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full"
              style={{ width: `${metrics.shelterCapacityPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>
              {metrics.openSheltersCount} of {metrics.totalSheltersCount} Open
            </span>
            <span className="text-emerald-700 font-semibold">119 Beds Open</span>
          </div>
        </div>

        {/* Metric 4: Optimization Coverage */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">
              Latest Proposal
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">route</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-inter text-2xl lg:text-3xl font-extrabold text-primary">
              {metrics.proposedPlanCoveragePercent}%
            </span>
            <span className="text-xs text-primary font-bold">PR-105 Coverage</span>
          </div>
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>3 Craft Planned</span>
            <span className="text-amber-800 font-semibold">1 Unserved</span>
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <Link
              className="text-primary font-semibold hover:underline"
              href="/operator/assignments/PR-105"
            >
              Review Proposal →
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
              </div>
              <Link
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                href="/operator/requests"
              >
                <span>Full List</span>
                <span className="material-symbols-outlined text-xs">arrow_forward</span>
              </Link>
            </div>

            <div className="space-y-2.5">
              {criticalRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-lg border border-outline-variant/70 bg-surface hover:bg-surface-container-low transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-on-surface">{req.id}</span>
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
                    </div>
                    <p className="text-xs text-on-surface-variant line-clamp-1">{req.notes}</p>
                    <div className="text-[11px] text-on-surface-variant font-mono">
                      <span>{req.peopleCount} passengers</span> •{' '}
                      <span>
                        GPS: {req.lat.toFixed(4)}, {req.lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  <Link
                    className="self-end sm:self-auto px-3 py-1.5 rounded bg-surface-container-high text-xs font-semibold text-on-surface hover:bg-primary hover:text-on-primary transition-colors text-center"
                    href="/operator/requests"
                  >
                    Inspect
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant">
            <span>Showing top 5 urgent tickets</span>
            <span className="font-mono text-[11px]">Updated live from demo state</span>
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
                  9 Distress clusters • 4 Rescue boats deployed • 3 Shelters open
                </p>
                <Link
                  className="inline-block px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
                  href="/operator/map"
                >
                  Launch Interactive Map
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Fleet Readiness Roster */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-outline-variant">
              <h3 className="text-sm font-bold text-on-surface">Available Rescue Assets</h3>
              <span className="text-xs font-mono text-on-surface-variant">4 Deployed / Ready</span>
            </div>
            <div className="space-y-2 text-xs">
              {SIMULATED_RESOURCES.map((res) => (
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SIMULATED_ASSIGNMENTS.map((plan) => (
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
      </section>
    </main>
  );
}
