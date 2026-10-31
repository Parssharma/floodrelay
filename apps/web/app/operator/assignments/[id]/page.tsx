'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import SimulatedNotice from '@/components/ui/SimulatedNotice';
import { SIMULATED_ASSIGNMENTS } from '@/lib/fixtures/assignments';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AssignmentReviewPage({ params }: PageProps) {
  const resolvedParams = React.use(params);
  const planId = resolvedParams.id;

  const plan = SIMULATED_ASSIGNMENTS.find((p) => p.id.toLowerCase() === planId.toLowerCase());

  // Interactive checklist states
  const [checklist, setChecklist] = useState({
    draftClearance: true,
    shelterCapacity: true,
    oxygenProtocol: true,
  });

  const [showCommitModal, setShowCommitModal] = useState(false);
  const [committedLocally, setCommittedLocally] = useState(false);

  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center space-y-4">
        <div className="h-16 w-16 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-3xl">search_off</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Assignment Plan Not Found</h1>
        <p className="text-sm text-slate-600">
          The requested proposal or committed plan ID{' '}
          <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">{planId}</code> does not
          exist in the simulated records.
        </p>
        <div className="pt-2">
          <Link
            href="/operator/assignments"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Return to Assignments List</span>
          </Link>
        </div>
      </div>
    );
  }

  const isProposed = !committedLocally && plan.status === 'PROPOSED';
  const allChecked =
    checklist.draftClearance && checklist.shelterCapacity && checklist.oxygenProtocol;

  return (
    <div className="max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner Notice */}
      <SimulatedNotice
        variant="banner"
        message="Simulated Assignment Review — Human-in-the-loop review interface. Live commit mutation (POST /api/v1/assignments/:id/commit) connects in Milestone 5."
      />

      {/* Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Link
            href="/operator/assignments"
            className="flex items-center gap-1 text-teal-700 hover:text-teal-800 font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Assignments List</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-600">{plan.id}</span>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-900">Human Review &amp; Authorization</span>
        </div>
        <div className="text-slate-400 font-mono text-[11px]">
          Harris County EOC • Desk Sector 4-B
        </div>
      </div>

      {/* Proposal Banner & Primary Action Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <StatusBadge status={isProposed ? 'PROPOSED' : 'COMMITTED'} />
              <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Generated:{' '}
                {new Date(plan.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                CDT
              </span>
              <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Sector: Harris North / Greenspoint
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {plan.id}: {plan.title ?? 'Emergency Evacuation Sweep'}
            </h1>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled
              className="h-9 px-3 rounded bg-slate-50 border border-slate-300 text-slate-400 text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed"
              title="Solver regeneration connects in Milestone 5"
            >
              <span className="material-symbols-outlined text-base">replay</span>
              <span>Regenerate (M5)</span>
            </button>
            {isProposed ? (
              <button
                type="button"
                disabled={!allChecked}
                onClick={() => setShowCommitModal(true)}
                className={`h-9 px-4 rounded text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
                  allChecked
                    ? 'bg-teal-700 hover:bg-teal-800 text-white ring-2 ring-teal-500/30'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-base">lock_open</span>
                <span>Commit Assignment &amp; Dispatch</span>
              </button>
            ) : (
              <div className="h-9 px-4 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-emerald-700">
                  verified
                </span>
                <span>Committed &amp; Dispatched</span>
              </div>
            )}
          </div>
        </div>

        {/* Human-in-the-Loop Safeguard Notice */}
        <div className="bg-slate-50 border-l-4 border-teal-700 rounded-r-lg p-3 sm:p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-teal-700 text-2xl shrink-0 mt-0.5">
            gavel
          </span>
          <div className="flex-1 text-xs">
            <div className="font-bold text-slate-900 flex items-center gap-2">
              <span>Human-in-the-Loop Safeguard Active</span>
              <span className="font-mono text-slate-500 font-normal">
                (FEMA Incident Command Protocol §4.2)
              </span>
            </div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              This plan is simulated and will <strong>NOT</strong> dispatch field assets until you
              explicitly verify safety constraints in the checklist and click Commit Assignment.
              Verify hydraulic drafts and safe drop-off shelter capacities before proceeding.
            </p>
          </div>
        </div>
      </section>

      {/* Two-Column Detailed Review Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* ===================================================================== */}
        {/* LEFT COLUMN: Vehicle Routes & Manifest (7/12 cols)                   */}
        {/* ===================================================================== */}
        <div className="xl:col-span-7 space-y-6">
          {/* Vehicle Card 1: Primary Detailed Asset (Boat Alpha-4) */}
          <article className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header Bar */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-1 rounded bg-teal-700 text-white">
                  <span className="material-symbols-outlined text-lg">sailing</span>
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">Swift Water Boat Alpha-4</h2>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-teal-100 text-teal-800 font-bold border border-teal-200">
                      SWB-04
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Pilot: <span className="font-semibold text-slate-700">Lt. J. Miller</span> •
                    Medic:{' '}
                    <span className="font-semibold text-slate-700">
                      Sgt. C. Tran (Oxygen Rated)
                    </span>
                  </div>
                </div>
              </div>

              {/* Peak Vessel Load */}
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">
                  Peak Load
                </div>
                <div className="text-xs font-bold text-slate-900">
                  7 <span className="text-slate-500 font-normal">/ 8 pax max</span>
                </div>
                <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1">
                  <div className="h-full bg-teal-700 rounded-full" style={{ width: '87.5%' }} />
                </div>
              </div>
            </div>

            {/* Ordered Route Stops Timeline */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs uppercase font-mono tracking-wider text-slate-500 font-semibold">
                  Ordered Navigation &amp; Pickup Sequence
                </span>
                <span className="text-xs font-mono text-teal-700 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">route</span>
                  Sequential VRP Solution: Opt-Path #1
                </span>
              </div>

              <div className="relative pl-6 space-y-3 before:absolute before:left-[11px] before:top-2 before:bottom-3 before:w-0.5 before:bg-slate-200">
                {/* Stop 1: Launch Depot */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold ring-4 ring-white">
                    1
                  </div>
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-500">[14:15]</span>
                        <span className="font-bold text-slate-900">
                          Launch: Buffalo Bayou Staging West
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 text-slate-600 font-mono">
                          Depot
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Vessel prepped with O2 respiratory kit
                      </p>
                    </div>
                    <div className="text-right text-[11px] font-mono">
                      <span className="font-semibold text-slate-700">0 pax onboard</span>
                      <div className="text-slate-400">Load: 0/8</div>
                    </div>
                  </div>
                </div>

                {/* Stop 2: Pickup FL-8824 */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[10px] font-bold ring-4 ring-white">
                    2
                  </div>
                  <div className="flex-1 bg-white border border-teal-200 rounded p-2.5 shadow-xs flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-teal-700">[14:48]</span>
                        <span className="font-bold text-slate-900">
                          Pickup #FL-8824: 1428 Riverbend Dr
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-100 text-red-800 font-bold border border-red-200 font-mono">
                          Critical
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px]">
                        <span className="text-teal-700 font-bold font-mono">+4 pax</span>
                        <span className="text-slate-300">•</span>
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[11px]">
                            medical_services
                          </span>{' '}
                          1 O2 Dependent
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[11px]">child_care</span>{' '}
                          1 infant
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-mono">
                      <span className="font-bold text-teal-700">+4 boarded</span>
                      <div className="text-slate-700 font-bold">Load: 4/8</div>
                    </div>
                  </div>
                </div>

                {/* Stop 3: Pickup FL-8819 */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[10px] font-bold ring-4 ring-white">
                    3
                  </div>
                  <div className="flex-1 bg-white border border-slate-200 rounded p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-teal-700">[15:05]</span>
                        <span className="font-bold text-slate-900">
                          Pickup #FL-8819: 102 Greens Rd, Bldg C
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-100 text-amber-800 font-semibold font-mono">
                          High
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px]">
                        <span className="text-teal-700 font-bold font-mono">+3 pax</span>
                        <span className="text-slate-300">•</span>
                        <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[11px]">accessible</span>{' '}
                          1 folded wheelchair
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-mono">
                      <span className="font-bold text-teal-700">+3 boarded</span>
                      <div className="text-slate-700 font-bold">Load: 7/8</div>
                    </div>
                  </div>
                </div>

                {/* Stop 4: Shelter Offload */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-teal-900 text-white flex items-center justify-center text-[10px] font-bold ring-4 ring-white">
                    4
                  </div>
                  <div className="flex-1 bg-teal-50 border border-teal-200 rounded p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-teal-800">[15:28]</span>
                        <span className="font-bold text-slate-900">
                          Shelter: Westchase High Gymnasium
                        </span>
                      </div>
                      <p className="text-[11px] text-teal-900 mt-0.5">
                        Intake Triage Red Cross Station B • Paramedic Hand-off ready
                      </p>
                    </div>
                    <div className="text-right text-[11px] font-mono">
                      <span className="font-bold text-emerald-800">-7 pax safe</span>
                      <div className="text-slate-500">Load: 0/8</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Travel Metrics Strip */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex flex-wrap items-center justify-between text-xs">
                <div className="flex items-center gap-4 text-slate-600">
                  <span className="flex items-center gap-1 font-mono">
                    <span className="material-symbols-outlined text-sm text-slate-500">
                      straighten
                    </span>
                    Est. distance: <strong className="text-slate-800">4.2 nm</strong>
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <span className="material-symbols-outlined text-sm text-slate-500">timer</span>
                    Est. duration: <strong className="text-slate-800">52m</strong>
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <span className="material-symbols-outlined text-sm text-slate-500">
                      local_gas_station
                    </span>
                    Fuel reserve: <strong className="text-slate-800">84%</strong>
                  </span>
                </div>
                <div className="text-[11px] font-mono text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Waterway Depth Safe
                  (&gt;1.8m)
                </div>
              </div>
            </div>
          </article>

          {/* Additional Fleet Units (Alpha-7 & HW-02) */}
          <article className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-slate-100 text-slate-700">
                  <span className="material-symbols-outlined text-base">sailing</span>
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    Swift Water Boat Alpha-7 (SWB-07)
                  </h3>
                  <div className="text-[11px] text-slate-500">
                    Pilot: CPO M. Briggs • Capacity: 6 pax max
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-mono">
                3 Pickups (6 pax) • Delmar Fieldhouse
              </span>
            </div>
          </article>

          <article className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-slate-100 text-slate-700">
                  <span className="material-symbols-outlined text-base">local_shipping</span>
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    High-Water Truck HW-02 (HWT-02)
                  </h3>
                  <div className="text-[11px] text-slate-500">
                    Operator: Sgt. K. Lopez • Capacity: 12 pax max
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-mono">
                2 Pickups (8 pax) • Westchase High
              </span>
            </div>
          </article>

          {/* Unserved Incidents Warning Box */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3 shadow-xs">
            <span className="material-symbols-outlined text-2xl text-amber-700 shrink-0 mt-0.5">
              warning
            </span>
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-amber-950 text-sm">
                  2 Incidents Excluded by Solver: Manual Amphibian Assignment Required
                </h4>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 uppercase font-mono">
                  Action Needed
                </span>
              </div>
              <p className="text-amber-900 leading-relaxed">
                The automated VRP algorithm excluded these locations due to safety boundary
                violations. These cases will remain queued unless assigned to a specialized
                amphibious unit:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                <div className="bg-white/80 border border-amber-200 rounded p-2 text-slate-800">
                  <span className="font-bold">#FL-8840</span> (1902 Greenspoint Mall) —{' '}
                  <span className="text-amber-800 font-semibold">Draft depth &lt; 0.3m</span> (Hull
                  ground risk). Requires high-water truck.
                </div>
                <div className="bg-white/80 border border-amber-200 rounded p-2 text-slate-800">
                  <span className="font-bold">#FL-8842</span> (Aldine Bender Rd) —{' '}
                  <span className="text-amber-800 font-semibold">Downed power lines</span>. Reported
                  live feeder cable across access bayou.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* RIGHT COLUMN: Topology Map, Checklist, Commit Trigger (5/12 cols)     */}
        {/* ===================================================================== */}
        <div className="xl:col-span-5 space-y-6">
          {/* Geospatial Routing Topology Panel */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span className="material-symbols-outlined text-teal-700 text-base">hub</span>
                <span>Geospatial Routing Topology</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> USGS Gauge Feed Active
              </span>
            </div>

            {/* Tactical Vector Map Canvas */}
            <div className="relative w-full h-64 bg-slate-900 overflow-hidden">
              <svg className="w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="miniGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#miniGrid)" />

                {/* Bayous */}
                <path
                  d="M -20,160 C 120,150 220,190 320,170 C 420,150 520,170 600,150"
                  fill="none"
                  stroke="#007a71"
                  strokeWidth="12"
                  opacity="0.8"
                />

                {/* Navigational Vector Path */}
                <polyline
                  points="60,170 140,150 220,130 360,80"
                  fill="none"
                  stroke="#80d5cb"
                  strokeWidth="3"
                  strokeDasharray="4,4"
                />

                {/* Nodes */}
                <circle cx="60" cy="170" r="5" fill="#334155" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="140" cy="150" r="6" fill="#dc2626" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="220" cy="130" r="6" fill="#d97706" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="360" cy="80" r="7" fill="#0f766e" stroke="#ffffff" strokeWidth="1.5" />
              </svg>

              {/* Overlay HUD */}
              <div className="absolute inset-0 p-3 flex flex-col justify-between pointer-events-none text-xs">
                <div className="flex items-center justify-between">
                  <span className="bg-slate-900/90 text-teal-300 font-mono text-[10px] px-2 py-0.5 rounded border border-slate-700">
                    Bayou Stage: 38.4 ft (Crest: 16:00)
                  </span>
                  <span className="bg-slate-900/90 text-slate-300 font-mono text-[10px] px-2 py-0.5 rounded border border-slate-700">
                    1:24,000 Tactical
                  </span>
                </div>
                <div className="bg-slate-900/95 text-slate-200 border border-slate-700 p-2 rounded text-[11px] font-mono max-w-[260px]">
                  <div className="font-bold text-teal-300">Alpha-4 Nautical Path Active</div>
                  <div className="text-[10px] text-slate-400">
                    Depot → Riverbend → Greens Rd → Westchase
                  </div>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-around text-[11px] font-mono text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-700 inline-block" /> 1. Depot
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> 2. FL-8824
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-600 inline-block" /> 3. FL-8819
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-teal-700 inline-block" /> 4. Safe Shelter
              </span>
            </div>
          </div>

          {/* Safety & Conflict Checklist */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-700 text-xl">
                  verified_user
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Safety &amp; Conflict Checklist
                </h3>
              </div>
              <span className="text-[10px] font-mono text-teal-800 bg-teal-100 px-2 py-0.5 rounded font-bold uppercase">
                Mandatory Verification
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Each operational constraint must be acknowledged by the watch commander before
              transmitting dispatches to crew field tablets:
            </p>

            <div className="space-y-2 pt-1 text-xs">
              {/* Checklist Item 1 */}
              <label className="flex items-start gap-2.5 p-2 rounded bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={checklist.draftClearance}
                  onChange={(e) =>
                    setChecklist((prev) => ({ ...prev, draftClearance: e.target.checked }))
                  }
                  className="mt-0.5 rounded text-teal-700 focus:ring-teal-700 border-slate-300 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-900">
                    [✓] Boat draft clearances verified against USGS gauge sensors
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Greens Bayou sensor #08075900 confirms min channel depth 2.4m along path.
                  </p>
                </div>
              </label>

              {/* Checklist Item 2 */}
              <label className="flex items-start gap-2.5 p-2 rounded bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={checklist.shelterCapacity}
                  onChange={(e) =>
                    setChecklist((prev) => ({ ...prev, shelterCapacity: e.target.checked }))
                  }
                  className="mt-0.5 rounded text-teal-700 focus:ring-teal-700 border-slate-300 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-900">
                    [✓] Shelter capacity confirmed (Westchase High: 142 beds remaining)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Red Cross liaison confirmed ready for intake (+7 pax incoming from Alpha-4).
                  </p>
                </div>
              </label>

              {/* Checklist Item 3 */}
              <label className="flex items-start gap-2.5 p-2 rounded bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={checklist.oxygenProtocol}
                  onChange={(e) =>
                    setChecklist((prev) => ({ ...prev, oxygenProtocol: e.target.checked }))
                  }
                  className="mt-0.5 rounded text-teal-700 focus:ring-teal-700 border-slate-300 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-900">
                    [✓] Oxygen protocol assigned to medic on Boat Alpha-4
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Sgt. Tran confirmed equipped with portable O2 concentrator kit #M-04.
                  </p>
                </div>
              </label>

              {/* Warning Notice */}
              <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-300 text-amber-950">
                <span className="material-symbols-outlined text-amber-700 text-base shrink-0 mt-0.5">
                  report_problem
                </span>
                <div>
                  <span className="font-bold">
                    [!] WARNING: Gusts 22kt in Greenspoint sector may slow transit by 8-12 min
                  </span>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    VRP solution includes +15% safety buffer for weather contingencies.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pre-Commit Authorization Box */}
          <section className="bg-white border-2 border-teal-700 rounded-xl p-4 sm:p-5 shadow-md space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <span className="p-1 rounded bg-teal-700 text-white">
                <span className="material-symbols-outlined text-lg">lock</span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ready to Dispatch?</h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  Irrevocable operational transmission trigger
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
              Committing will transmit official operational dispatch tickets to{' '}
              <strong>3 crew vessel tablets</strong> and initiate{' '}
              <strong>automated citizen SMS alerts</strong> to affected residents with live tracking
              links.
            </div>

            {isProposed ? (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={!allChecked}
                  onClick={() => setShowCommitModal(true)}
                  className={`w-full h-10 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 ${
                    allChecked
                      ? 'bg-teal-700 hover:bg-teal-800 text-white ring-2 ring-teal-500/30 active:scale-[0.99]'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">lock_open</span>
                  <span>Confirm &amp; Authorize Dispatch</span>
                </button>
                {!allChecked && (
                  <p className="text-[11px] text-red-600 text-center font-medium">
                    Acknowledge all 3 checklist safety items before dispatching.
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-1">
                <div className="text-xs font-bold text-emerald-900 flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-700 text-base">
                    task_alt
                  </span>
                  <span>Plan Committed &amp; Transmitted</span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Transmitted to field tablets at {new Date().toLocaleTimeString()} CDT.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Simulated Commit Modal */}
      {showCommitModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center gap-3 text-teal-700">
              <span className="material-symbols-outlined text-3xl">verified_user</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Authorize Dispatch: {plan.id}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  Phase 3 Milestone 1 Simulated Preview
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-amber-700 text-base">info</span>
                Development Mode Notice: No Real Field Dispatches Sent
              </p>
              <p className="leading-relaxed">
                In Milestone 1, the frontend UI and client components are verified against simulated
                fixtures. Clicking &quot;Simulate Authorization&quot; updates this session&apos;s UI
                badge to demonstrate the committed state without writing to the backend PostgreSQL
                database or dispatching real SMS.
              </p>
              <p className="font-mono text-[11px] text-slate-700">
                Live backend commit mutation (<code>POST /api/v1/assignments/:id/commit</code>)
                connects in <strong>Milestone 5</strong>.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCommitModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setCommittedLocally(true);
                  setShowCommitModal(false);
                }}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
              >
                Simulate Authorization (UI Preview)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
