'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import { apiClient } from '@/lib/api/client';
import { ApiClientError } from '@/lib/api/errors';
import type { AssignmentRecord, ProposeAssignmentInput } from '@/lib/api/types';

export default function OperatorAssignmentsPage() {
  const [plans, setPlans] = useState<AssignmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [filterTab, setFilterTab] = useState<'ALL' | 'PROPOSED' | 'COMMITTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Proposal modal form state
  const [algorithm, setAlgorithm] = useState<'cluster-allocation' | 'nearest-first' | 'savings'>(
    'cluster-allocation',
  );
  const [scenarioId, setScenarioId] = useState('scenario-delhi-yamuna-demo');
  const [maxShiftMinutes, setMaxShiftMinutes] = useState(480);
  const [preserveFrozen, setPreserveFrozen] = useState(true);
  const [includeUnverified, setIncludeUnverified] = useState(false);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [newlyCreatedPlanId, setNewlyCreatedPlanId] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.listAssignments();
      setPlans(data || []);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError((err as Error).message || 'Failed to load assignment plans from database.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleGenerateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingProposal) return;

    try {
      setIsSubmittingProposal(true);
      setProposalError(null);

      const input: ProposeAssignmentInput = {
        algorithm,
        scenarioId: scenarioId.trim() || 'scenario-delhi-yamuna-demo',
        maxShiftMinutes: Number(maxShiftMinutes) || 480,
        preserveFrozen,
        includeUnverified,
      };

      const result = await apiClient.proposeAssignment(input);
      setNewlyCreatedPlanId(result.id);
      await fetchAssignments();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setProposalError(err.message);
      } else {
        setProposalError((err as Error).message || 'Failed to generate solver proposal.');
      }
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const filteredPlans = plans.filter((plan) => {
    if (filterTab !== 'ALL' && plan.status !== filterTab) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = plan.id.toLowerCase().includes(q);
      const matchScenario = (plan.scenario_id ?? plan.scenarioId ?? '').toLowerCase().includes(q);
      const matchTitle = (plan.title ?? '').toLowerCase().includes(q);
      if (!matchId && !matchScenario && !matchTitle) return false;
    }
    return true;
  });

  const proposedCount = plans.filter((p) => p.status === 'PROPOSED').length;
  const committedCount = plans.filter((p) => p.status === 'COMMITTED').length;
  const totalUnservedCount = plans.reduce((acc, p) => acc + (p.unserved?.length ?? 0), 0);
  const totalServedRequests = plans.reduce(
    (acc, p) => acc + (p.metrics?.servedRequestsCount ?? 0),
    0,
  );

  return (
    <div className="max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner Notice */}
      <div className="bg-slate-900 text-white rounded-xl p-3.5 sm:p-4 border border-slate-800 flex items-start gap-3 shadow-sm">
        <span className="material-symbols-outlined text-teal-400 text-xl shrink-0 mt-0.5">
          verified_user
        </span>
        <div className="text-xs">
          <span className="font-bold text-teal-300">Live PostGIS &amp; Solver Integration</span>
          <p className="text-slate-300 mt-0.5 leading-relaxed">
            Connected to real PostgreSQL/PostGIS database. VRP solver generates mathematical
            allocation proposals. Committing records an operator-approved plan in the database; it
            does not initiate physical boat dispatch.
          </p>
        </div>
      </div>

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
            onClick={fetchAssignments}
            disabled={isLoading}
            className="h-9 px-3 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 bg-white transition-colors"
            title="Refresh assignment plans from database"
          >
            <span
              className={`material-symbols-outlined text-base ${isLoading ? 'animate-spin' : ''}`}
            >
              refresh
            </span>
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setNewlyCreatedPlanId(null);
              setProposalError(null);
              setShowGenerateModal(true);
            }}
            className="h-9 px-4 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            <span>[+] Generate New VRP Solver Proposal</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Metric 1: Active Committed Plans */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-teal-600">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Active Committed Plans
            </span>
            <span className="material-symbols-outlined text-teal-700 text-xl">directions_boat</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-slate-900">
              {committedCount}{' '}
              <span className="text-sm text-slate-500 font-normal">Committed Plans</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Operator-approved allocation decisions stored in PostGIS
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <span className="text-teal-700 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Database Synced
            </span>
            <span className="text-slate-400">PostGIS Stored</span>
          </div>
        </div>

        {/* Metric 2: Pending Solver Proposals */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Pending Solver Proposals
            </span>
            <span className="material-symbols-outlined text-amber-600 text-xl">psychology</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-amber-700">
              {proposedCount}{' '}
              <span className="text-sm text-slate-500 font-normal">Pending Review</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Awaiting operator review and formal commitment
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <span className="text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              {proposedCount > 0 ? 'Action Required' : 'All Reviewed'}
            </span>
            <span className="text-slate-400">VRP Solved</span>
          </div>
        </div>

        {/* Metric 3: Total Unserved Backlog */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-red-600">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Unserved Demand Across Plans
            </span>
            <span className="material-symbols-outlined text-red-600 text-xl">report_problem</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-red-700">
              {totalUnservedCount}{' '}
              <span className="text-sm text-slate-500 font-normal">Unserved Requests</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Excluded due to craft capacity, shift limit, or safety constraints
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <span className="text-red-700 font-semibold">
              {totalUnservedCount > 0 ? 'Requires Resource Scaling' : 'Demand Covered'}
            </span>
            <span className="text-slate-400">Capacity Constrained</span>
          </div>
        </div>

        {/* Metric 4: Total Requests Allocated */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-slate-600">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider font-semibold">
              Requests Allocated
            </span>
            <span className="material-symbols-outlined text-slate-600 text-xl">group</span>
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-slate-900">
              {totalServedRequests}{' '}
              <span className="text-sm text-slate-500 font-normal">Served Targets</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Assigned across {plans.length} operational plans
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-700 font-semibold">Fleet Utilization</span>
            <span className="text-slate-500 font-mono">{plans.length} Plans Recorded</span>
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
              All Plans ({plans.length})
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
              <span>Committed Plans</span>
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
                placeholder="Search plan ID or scenario..."
                className="h-8 pl-8 pr-3 rounded border border-slate-300 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 w-48 sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* Loading / Error / Empty States */}
        {isLoading && (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200 space-y-3">
            <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-sm font-semibold text-slate-800 font-mono">
              Loading assignment plans from database...
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center space-y-3">
            <div className="text-red-700 font-bold text-sm">Failed to Load Assignment Plans</div>
            <p className="text-xs text-red-600">{error}</p>
            <button
              type="button"
              onClick={fetchAssignments}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && filteredPlans.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200 space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">route</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">No Assignment Plans Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {plans.length === 0
                  ? 'There are currently no solver proposals or committed plans stored in the database. Generate a proposal using the solver to allocate resources to pending rescue requests.'
                  : 'No plans match the selected filter or search query.'}
              </p>
            </div>
            {plans.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setNewlyCreatedPlanId(null);
                  setProposalError(null);
                  setShowGenerateModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                <span className="material-symbols-outlined text-base">add_circle</span>
                <span>Generate First Solver Proposal</span>
              </button>
            )}
          </div>
        )}

        {/* Proposals & Committed Cards List */}
        {!isLoading && !error && filteredPlans.length > 0 && (
          <div className="space-y-4">
            {filteredPlans.map((plan) => {
              const isProposed = plan.status === 'PROPOSED';
              const createdDate = new Date(plan.created_at ?? plan.createdAt);
              const formattedDate = !isNaN(createdDate.getTime())
                ? createdDate.toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Just now';

              const scenarioDisplay =
                plan.scenario_id ?? plan.scenarioId ?? 'scenario-delhi-yamuna-demo';
              const servedCount = plan.metrics?.servedRequestsCount ?? 0;
              const coveragePct = Math.round(plan.metrics?.coveragePercent ?? 0);
              const unservedCount = plan.unserved?.length ?? 0;
              const travelTime = Math.round(plan.metrics?.totalTravelTimeMinutes ?? 0);
              const waitTime = Math.round(plan.metrics?.highPriorityWaitTimeMinutes ?? 0);

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
                      isProposed
                        ? 'bg-amber-50/80 border-amber-200'
                        : 'bg-teal-50/70 border-teal-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={plan.status} />
                      <div className="h-4 w-px bg-slate-300" />
                      <h2 className="text-base font-bold text-slate-900 font-mono">{plan.id}</h2>
                      <span className="text-xs text-slate-600 hidden sm:inline">
                        Scenario: <strong className="font-mono">{scenarioDisplay}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-slate-500">{formattedDate}</span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          isProposed
                            ? 'bg-amber-200/60 text-amber-900'
                            : 'bg-teal-100 text-teal-900'
                        }`}
                      >
                        {isProposed ? 'Awaiting Human Commit' : 'Operator Committed'}
                      </span>
                    </div>
                  </div>

                  {/* Card Body Grid */}
                  <div className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-center">
                      {/* Scenario / Entity Details */}
                      <div className="lg:col-span-3 space-y-1">
                        <div className="text-xs uppercase font-mono tracking-wider text-slate-500 flex items-center gap-1 font-semibold">
                          <span className="material-symbols-outlined text-teal-700 text-sm">
                            hub
                          </span>
                          Plan Parameters
                        </div>
                        <div className="text-xs text-slate-800 font-mono">
                          ID: <span className="font-bold">{plan.id}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {scenarioDisplay}
                        </div>
                        {plan.committed_by && (
                          <div className="text-[11px] text-emerald-700 font-mono">
                            Committed by: {plan.committed_by}
                          </div>
                        )}
                      </div>

                      {/* Served Targets */}
                      <div className="lg:col-span-3 space-y-1">
                        <div className="text-xs uppercase font-mono tracking-wider text-slate-500 flex items-center gap-1 font-semibold">
                          <span className="material-symbols-outlined text-emerald-600 text-sm">
                            group
                          </span>
                          Served Demand
                        </div>
                        <div className="text-sm font-semibold text-slate-900 pt-0.5">
                          {servedCount} Requests{' '}
                          <span className="text-teal-700 font-bold">Allocated</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {coveragePct}% of eligible demand covered
                        </p>
                      </div>

                      {/* Unserved Backlog / Feasibility */}
                      <div className="lg:col-span-3 space-y-1">
                        <div className="text-xs uppercase font-mono tracking-wider text-slate-500 flex items-center gap-1 font-semibold">
                          <span
                            className={`material-symbols-outlined text-sm ${
                              unservedCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            {unservedCount > 0 ? 'warning' : 'check_circle'}
                          </span>
                          Feasibility Assessment
                        </div>
                        {unservedCount > 0 ? (
                          <div className="text-xs text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-200 font-medium">
                            {unservedCount} Request(s) unserved:{' '}
                            <span className="font-mono">
                              {plan.unserved?.[0]?.reason || 'Capacity constraint'}
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-emerald-900 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 font-medium">
                            100% Demand Covered. Zero unserved targets.
                          </div>
                        )}
                      </div>

                      {/* Metrics and Action Link */}
                      <div className="lg:col-span-3 flex flex-col items-start lg:items-end justify-between space-y-2">
                        <div className="text-right">
                          <div className="text-xs font-mono text-slate-600">
                            Est. Travel:{' '}
                            <span className="font-bold text-slate-900">~{travelTime}m</span> | High
                            Pri Wait: <span className="font-bold text-slate-900">{waitTime}m</span>
                          </div>
                          <div className="text-[11px] text-teal-700 font-mono mt-0.5">
                            Status: {plan.status}
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
                            {isProposed ? 'Review & Commit Proposal' : 'View Committed Details'}
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
        )}
      </section>

      {/* Modal for Generate Proposal Form */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5 text-teal-700">
                <span className="material-symbols-outlined text-2xl">psychology</span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Generate VRP Solver Proposal</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Deterministic Fleet Optimization Engine
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {newlyCreatedPlanId ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-950 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                    <span className="material-symbols-outlined text-emerald-700">task_alt</span>
                    <span>Solver Proposal Successfully Generated!</span>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    New assignment plan{' '}
                    <strong className="font-mono bg-emerald-100 px-1 py-0.5 rounded">
                      {newlyCreatedPlanId}
                    </strong>{' '}
                    has been calculated and stored with status <strong>PROPOSED</strong>.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGenerateModal(false);
                      setNewlyCreatedPlanId(null);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Done
                  </button>
                  <Link
                    href={`/operator/assignments/${newlyCreatedPlanId}`}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Open Review &amp; Commit Screen</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerateProposal} className="space-y-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <span className="material-symbols-outlined text-teal-700 text-sm">info</span>
                    <span>Decision-Support Optimization Engine</span>
                  </div>
                  <p className="leading-relaxed">
                    Generates an optimal route proposal across pending requests and available craft.
                    The resulting plan remains in <strong>PROPOSED</strong> status until an operator
                    reviews and explicitly commits it.
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono pt-1">
                    * Google OR-Tools is an offline benchmark solver. Live proposals execute the
                    production deterministic VRP engine.
                  </p>
                </div>

                {proposalError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                    <span className="material-symbols-outlined text-base shrink-0 mt-0.5">
                      error
                    </span>
                    <div>
                      <span className="font-bold">Proposal Failed: </span>
                      {proposalError}
                    </div>
                  </div>
                )}

                {/* Algorithm Selection */}
                <div className="space-y-1">
                  <label
                    htmlFor="solver-algo"
                    className="block text-xs font-bold text-slate-800 font-mono"
                  >
                    VRP Solver Algorithm
                  </label>
                  <select
                    id="solver-algo"
                    value={algorithm}
                    onChange={(e) =>
                      setAlgorithm(
                        e.target.value as 'cluster-allocation' | 'nearest-first' | 'savings',
                      )
                    }
                    className="w-full h-9 rounded border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:ring-1 focus:ring-teal-700 focus:border-teal-700"
                  >
                    <option value="cluster-allocation">
                      Cluster Allocation (DBSCAN + VRP) — Recommended
                    </option>
                    <option value="savings">
                      Clarke-Wright Savings Baseline (Fast tour merges)
                    </option>
                    <option value="nearest-first">
                      Nearest First (Greedy, minimizes initial wait)
                    </option>
                  </select>
                </div>

                {/* Scenario ID */}
                <div className="space-y-1">
                  <label
                    htmlFor="scenario-id"
                    className="block text-xs font-bold text-slate-800 font-mono"
                  >
                    Scenario Identifier
                  </label>
                  <input
                    id="scenario-id"
                    type="text"
                    value={scenarioId}
                    onChange={(e) => setScenarioId(e.target.value)}
                    placeholder="scenario-delhi-yamuna-demo"
                    className="w-full h-9 rounded border border-slate-300 bg-white px-3 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-700 focus:border-teal-700"
                  />
                </div>

                {/* Max Shift Minutes */}
                <div className="space-y-1">
                  <label
                    htmlFor="max-shift"
                    className="block text-xs font-bold text-slate-800 font-mono"
                  >
                    Maximum Shift Duration (Minutes)
                  </label>
                  <input
                    id="max-shift"
                    type="number"
                    min="30"
                    max="1440"
                    value={maxShiftMinutes}
                    onChange={(e) => setMaxShiftMinutes(Number(e.target.value))}
                    className="w-full h-9 rounded border border-slate-300 bg-white px-3 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-700 focus:border-teal-700"
                  />
                </div>

                {/* Checkboxes */}
                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preserveFrozen}
                      onChange={(e) => setPreserveFrozen(e.target.checked)}
                      className="rounded text-teal-700 focus:ring-teal-700 border-slate-300 cursor-pointer"
                    />
                    <span className="text-slate-700">
                      Preserve existing frozen stops from previous committed plan
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeUnverified}
                      onChange={(e) => setIncludeUnverified(e.target.checked)}
                      className="rounded text-teal-700 focus:ring-teal-700 border-slate-300 cursor-pointer"
                    />
                    <span className="text-slate-700">
                      Include unverified requests in proposal optimization
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowGenerateModal(false)}
                    disabled={isSubmittingProposal}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingProposal}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                      isSubmittingProposal
                        ? 'bg-teal-400 text-white cursor-not-allowed'
                        : 'bg-teal-700 hover:bg-teal-800 text-white'
                    }`}
                  >
                    {isSubmittingProposal ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Running Solver...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">psychology</span>
                        <span>Generate Solver Proposal</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
