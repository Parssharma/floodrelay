'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import SimulatedNotice from '@/components/ui/SimulatedNotice';
import { SIMULATED_ASSIGNMENTS } from '@/lib/fixtures/assignments';

export default function OperatorAssignmentsPage() {
  const [filterTab, setFilterTab] = useState<'ALL' | 'PROPOSED' | 'COMMITTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  const filteredPlans = SIMULATED_ASSIGNMENTS.filter((plan) => {
    if (filterTab !== 'ALL' && plan.status !== filterTab) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = plan.id.toLowerCase().includes(q);
      const matchTitle = (plan.title ?? '').toLowerCase().includes(q);
      const matchAssets = (plan.assetsAssigned ?? []).some((a) => a.toLowerCase().includes(q));
      if (!matchId && !matchTitle && !matchAssets) return false;
    }
    return true;
  });

  const proposedCount = SIMULATED_ASSIGNMENTS.filter((p) => p.status === 'PROPOSED').length;
  const committedCount = SIMULATED_ASSIGNMENTS.filter((p) => p.status === 'COMMITTED').length;

  return (
    <div className="max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner Notice */}
      <SimulatedNotice
        variant="banner"
        message="Simulated Fleet Dispatch State — Proposals are pre-computed fixtures. Solver generation and commit mutations connect in Milestone 5."
      />

      {/* Header and Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Rescue Resource Assignments &amp; Solver Proposals
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Human-supervised fleet allocation. Distinct separation between automated solver
            proposals and human-committed field plans.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled
            className="h-9 px-3 rounded border border-slate-300 text-slate-400 text-xs font-semibold flex items-center gap-1.5 bg-slate-50 cursor-not-allowed"
            title="Manual plan upload connects in future release"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            <span>Upload Manual Dispatch Plan</span>
          </button>
          <button
            type="button"
            onClick={() => setShowGenerateModal(true)}
            className="h-9 px-4 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            <span>[+] Generate New VRP Solver Proposal</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-teal-600">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Active Committed Plans
            </span>
            <span className="material-symbols-outlined text-teal-700 text-xl">directions_boat</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-slate-900">
              6 <span className="text-sm text-slate-500 font-normal">Active Fleets</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              24 vessels deployed,{' '}
              <strong className="text-slate-800 font-semibold">82 civilians</strong> rescued today
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <span className="text-teal-700 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live Telemetry OK
            </span>
            <span className="text-slate-400">100% SatLink</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Pending Solver Proposals
            </span>
            <span className="material-symbols-outlined text-amber-600 text-xl">psychology</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-amber-700">
              2 <span className="text-sm text-slate-500 font-normal">Proposals</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Awaiting operator review and formal authorization
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <span className="text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Action Required
            </span>
            <span className="text-slate-400">VRP 2.4 Solved</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-red-600">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Unserved Backlog
            </span>
            <span className="material-symbols-outlined text-red-600 text-xl">report_problem</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-red-700">
              12 <span className="text-sm text-slate-500 font-normal">Requests</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Unassigned due to draft or wire hazard constraints
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <span className="text-red-700 font-semibold">2 Critical In Backlog</span>
            <span className="text-slate-400">Air Support Req</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-slate-600">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Fleet Utilization
            </span>
            <span className="material-symbols-outlined text-slate-600 text-xl">speed</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-slate-900">
              80% <span className="text-sm text-slate-500 font-normal">(24/30)</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              6 standby vessels at Sector 4 staging depot
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mr-2">
              <div className="bg-teal-700 h-1.5 rounded-full" style={{ width: '80%' }} />
            </div>
            <span className="text-slate-700 shrink-0">6 Reserve</span>
          </div>
        </div>
      </section>

      {/* Tabs & Search Controls */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-2 text-xs font-semibold rounded-t transition-colors border-b-2 ${
                filterTab === 'ALL'
                  ? 'border-teal-700 text-teal-800 bg-white shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              All Plans ({SIMULATED_ASSIGNMENTS.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('PROPOSED')}
              className={`px-3 py-2 text-xs font-semibold rounded-t transition-colors border-b-2 flex items-center gap-1.5 ${
                filterTab === 'PROPOSED'
                  ? 'border-amber-600 text-amber-900 bg-white shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pending Review &amp; Commit</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                {proposedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('COMMITTED')}
              className={`px-3 py-2 text-xs font-semibold rounded-t transition-colors border-b-2 flex items-center gap-1.5 ${
                filterTab === 'COMMITTED'
                  ? 'border-teal-700 text-teal-800 bg-white shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Committed / In Execution</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                {committedCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-base">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search proposal or fleet..."
                className="h-8 pl-8 pr-3 rounded border border-slate-300 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 w-48 sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* Proposals & Committed Cards List */}
        <div className="space-y-4">
          {filteredPlans.map((plan) => {
            const isProposed = plan.status === 'PROPOSED';

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-xl shadow-sm overflow-hidden transition-all border-2 ${
                  isProposed
                    ? 'border-amber-400 hover:border-amber-500'
                    : 'border-teal-500 hover:border-teal-600'
                }`}
              >
                {/* Header Strip */}
                <div
                  className={`px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 ${
                    isProposed ? 'bg-amber-50/80 border-amber-200' : 'bg-teal-50/70 border-teal-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={plan.status} />
                    <div className="h-4 w-px bg-slate-300" />
                    <h2 className="text-base font-bold text-slate-900">
                      {plan.id}: {plan.title ?? 'Emergency Dispatch Wave'}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        isProposed ? 'bg-amber-200/60 text-amber-900' : 'bg-teal-100 text-teal-900'
                      }`}
                    >
                      Engine: VRP Solver v2.4 (Max Pax / Min Travel Time)
                    </span>
                  </div>
                </div>

                {/* Card Body Grid */}
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-center">
                    {/* Assets Assigned */}
                    <div className="lg:col-span-3 space-y-1">
                      <div className="text-xs uppercase font-mono tracking-wider text-slate-500 flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-teal-700 text-sm">
                          directions_boat
                        </span>
                        Assets Assigned ({plan.assetsAssigned?.length ?? plan.routes?.length ?? 1}{' '}
                        Units)
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(plan.assetsAssigned ?? ['Boat Alpha-4', 'Boat Alpha-7']).map(
                          (asset, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-slate-100 text-slate-800 text-xs font-mono rounded border border-slate-200 flex items-center gap-1"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                              {asset}
                            </span>
                          ),
                        )}
                      </div>
                    </div>

                    {/* Served Targets */}
                    <div className="lg:col-span-3 space-y-1">
                      <div className="text-xs uppercase font-mono tracking-wider text-slate-500 flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-emerald-600 text-sm">
                          group
                        </span>
                        Served Targets
                      </div>
                      <div className="text-sm font-semibold text-slate-900 pt-1">
                        {plan.metrics?.servedRequestsCount ?? 12} Requests{' '}
                        <span className="text-teal-700 font-bold">
                          ({(plan.metrics?.servedRequestsCount ?? 12) * 3} Civilians Rescued)
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {plan.metrics?.coveragePercent ?? 94}% sector coverage
                      </p>
                    </div>

                    {/* Unserved Backlog / Feasibility */}
                    <div className="lg:col-span-3 space-y-1">
                      <div className="text-xs uppercase font-mono tracking-wider text-slate-500 flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-sm text-amber-600">
                          flag
                        </span>
                        {plan.unserved && plan.unserved.length > 0
                          ? 'Constraint Flags'
                          : 'Feasibility Assessment'}
                      </div>
                      {plan.unserved && plan.unserved.length > 0 ? (
                        <div className="text-xs text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-200 font-medium">
                          {plan.unserved.length} Request(s) flagged: {plan.unserved[0].reason}
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-900 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 font-medium">
                          Optimal egress path verified. Zero route hazards.
                        </div>
                      )}
                    </div>

                    {/* Metrics and Action Link */}
                    <div className="lg:col-span-3 flex flex-col items-start lg:items-end justify-between space-y-2">
                      <div className="text-right">
                        <div className="text-xs font-mono text-slate-600">
                          Total Mission:{' '}
                          <span className="font-bold text-slate-900">
                            ~{Math.round(plan.metrics?.totalTravelTimeMinutes ?? 45)}m
                          </span>{' '}
                          | Wait:{' '}
                          <span className="font-bold text-slate-900">
                            {Math.round(plan.metrics?.highPriorityWaitTimeMinutes ?? 14)}m
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-700 font-mono mt-0.5">
                          Calculated fuel reserve: +42% contingency
                        </div>
                      </div>

                      <Link
                        href={`/operator/assignments/${plan.id}`}
                        className={`h-8 px-4 rounded text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs ${
                          isProposed
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-teal-700 hover:bg-teal-800 text-white'
                        }`}
                      >
                        <span>
                          {isProposed ? 'Review & Commit Proposal' : 'View Execution Details'}
                        </span>
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modal for Generate Proposal Disclaimer */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center gap-3 text-amber-600">
              <span className="material-symbols-outlined text-3xl">psychology</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">VRP Solver Generation</h3>
                <p className="text-xs text-slate-500 font-mono">Phase 3 Milestone 1 Scope</p>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Simulated Environment Notice</p>
              <p>
                In Milestone 1, all proposal records (such as PR-105 and PR-106) are static
                deterministic fixtures to guarantee verifiable UI testing.
              </p>
              <p className="text-slate-600">
                Live solver computation via the backend Express API (
                <code className="font-mono bg-white px-1">POST /api/v1/assignments/propose</code>)
                connects in <strong>Milestone 5</strong>.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
