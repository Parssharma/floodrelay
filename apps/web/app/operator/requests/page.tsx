'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { RescueRequest, UrgencyLevel, RequestStatus } from '@floodrelay/shared';
import { apiClient } from '@/lib/api/client';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';

function OperatorRequestsContent() {
  const searchParams = useSearchParams();
  const inspectId = searchParams.get('inspect');

  const [requests, setRequests] = useState<RescueRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | UrgencyLevel>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RequestStatus>('ALL');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(inspectId);

  const loadRequests = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);
        const data = await apiClient.listRequests();
        setRequests(data || []);
        setLastRefreshed(new Date());

        // If an inspect query param is present, select that item if it exists
        if (inspectId && data.some((r) => r.id === inspectId)) {
          setSelectedRequestId(inspectId);
        } else if (!selectedRequestId && data.length > 0) {
          setSelectedRequestId(data[0]?.id || null);
        }
      } catch (err) {
        setError((err as Error).message || 'Failed to fetch rescue requests from API');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [inspectId, selectedRequestId],
  );

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (urgencyFilter !== 'ALL' && req.urgency !== urgencyFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && req.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = req.id.toLowerCase().includes(q);
        const matchesNotes = req.notes?.toLowerCase().includes(q);
        const matchesCoords = req.lat.toString().includes(q) || req.lng.toString().includes(q);
        const matchesPeople = req.peopleCount.toString() === q;
        if (!matchesId && !matchesNotes && !matchesCoords && !matchesPeople) {
          return false;
        }
      }
      return true;
    });
  }, [requests, searchQuery, urgencyFilter, statusFilter]);

  // Selected request object
  const selectedRequest = useMemo(() => {
    if (!selectedRequestId) {
      return filteredRequests[0] || null;
    }
    return requests.find((r) => r.id === selectedRequestId) || filteredRequests[0] || null;
  }, [requests, selectedRequestId, filteredRequests]);

  return (
    <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1600px] w-full mx-auto">
      {/* Top Header & Triage Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-on-surface">Rescue Request Management</h1>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-tertiary-container text-on-tertiary">
              {filteredRequests.length} Active / {requests.length} Total
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">
            Inbound citizen distress queue with automated urgency triage, proximity grouping, and
            duplicate detection.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            POSTGIS SNAPSHOT
          </span>
          {lastRefreshed && (
            <span className="text-[11px] text-on-surface-variant font-mono hidden md:inline">
              Synced {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => loadRequests(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold transition-colors disabled:opacity-50"
            title="Refresh requests"
            type="button"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin' : ''}`}
            >
              refresh
            </span>
            <span>Refresh</span>
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
            onClick={() => loadRequests(false)}
            className="px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-white font-bold transition-colors"
            type="button"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Request ID, GPS coords, or notes..."
            type="text"
            value={searchQuery}
          />
          {searchQuery && (
            <button
              className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface"
              onClick={() => setSearchQuery('')}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Urgency Filter */}
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant text-xs overflow-x-auto max-w-full">
            <span className="px-2 text-on-surface-variant font-medium">Urgency:</span>
            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => (
              <button
                key={lvl}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  urgencyFilter === lvl
                    ? 'bg-primary-container text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                onClick={() => setUrgencyFilter(lvl)}
                type="button"
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant text-xs overflow-x-auto max-w-full">
            <span className="px-2 text-on-surface-variant font-medium">Status:</span>
            {(['ALL', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'RESCUED', 'CANCELLED'] as const).map(
              (st) => (
                <button
                  key={st}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    statusFilter === st
                      ? 'bg-primary-container text-on-primary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => setStatusFilter(st)}
                  type="button"
                >
                  {st}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* TWO-COLUMN WORKSPACE: Request Table/List & Selected Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Requests Table (8 cols on lg) */}
        <section className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-xs">
          {isLoading && requests.length === 0 ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 rounded bg-surface-container-low animate-pulse" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant space-y-3">
              <span className="material-symbols-outlined text-4xl text-emerald-500">task_alt</span>
              <p className="text-sm font-semibold text-on-surface">
                No rescue requests in database
              </p>
              <p className="text-xs max-w-md mx-auto">
                The database is clean. Emergency rescue requests submitted by citizens via the
                public portal will appear here instantly.
              </p>
              <div className="pt-2">
                <Link
                  href="/citizen"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
                >
                  <span>Submit Test Citizen Request</span>
                  <span className="material-symbols-outlined text-xs">open_in_new</span>
                </Link>
              </div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant space-y-3">
              <span className="material-symbols-outlined text-4xl text-outline">search_off</span>
              <p className="text-sm font-semibold text-on-surface">
                No distress requests match your filter
              </p>
              <p className="text-xs max-w-sm mx-auto">
                Try clearing your search terms or selecting &quot;ALL&quot; across urgency and
                status categories.
              </p>
              <button
                className="px-4 py-2 rounded-lg bg-surface-container text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                onClick={() => {
                  setSearchQuery('');
                  setUrgencyFilter('ALL');
                  setStatusFilter('ALL');
                }}
                type="button"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant text-on-surface-variant font-mono font-semibold">
                    <th className="py-3 px-4">Request ID</th>
                    <th className="py-3 px-4">Urgency</th>
                    <th className="py-3 px-4">Pax</th>
                    <th className="py-3 px-4">Coordinates</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Report Notes</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60">
                  {filteredRequests.map((req) => {
                    const isSelected = selectedRequest?.id === req.id;
                    return (
                      <tr
                        key={req.id}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary-fixed/20 border-l-4 border-l-primary'
                            : 'hover:bg-surface-container-low'
                        }`}
                        onClick={() => setSelectedRequestId(req.id)}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-on-surface">
                          <div className="flex items-center gap-1.5">
                            <span>{req.id}</span>
                            {req.isFlaggedDuplicate && (
                              <span
                                className="px-1.5 py-0.2 rounded text-[10px] bg-amber-100 text-amber-900 font-bold"
                                title={`Duplicate report of ${req.duplicateOfId || 'existing ticket'}`}
                              >
                                DUP
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <UrgencyBadge urgency={req.urgency} />
                        </td>
                        <td className="py-3 px-4 font-bold text-on-surface">{req.peopleCount}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-on-surface-variant">
                          {req.lat.toFixed(4)}, {req.lng.toFixed(4)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={req.status || 'PENDING'} />
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-on-surface-variant">
                          {req.notes || 'No caller notes'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            className="px-2.5 py-1 rounded bg-surface-container hover:bg-primary hover:text-on-primary font-semibold text-[11px] transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRequestId(req.id);
                            }}
                            type="button"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Column: Selected Request Inspector (4 cols on lg) */}
        <section className="lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-xs sticky top-20">
          {selectedRequest ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                <div>
                  <span className="font-mono text-[10px] uppercase font-bold text-primary block">
                    INSPECTOR PANEL
                  </span>
                  <h3 className="font-mono text-base font-bold text-on-surface">
                    {selectedRequest.id}
                  </h3>
                </div>
                <UrgencyBadge urgency={selectedRequest.urgency} />
              </div>

              {/* Status and Attributes Strip */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                  <span className="text-[10px] text-on-surface-variant block">Status</span>
                  <StatusBadge status={selectedRequest.status || 'PENDING'} />
                </div>
                <div className="p-2.5 rounded-lg bg-surface border border-outline-variant/60">
                  <span className="text-[10px] text-on-surface-variant block">Passenger Count</span>
                  <span className="font-bold text-on-surface text-sm">
                    {selectedRequest.peopleCount} People
                  </span>
                </div>
              </div>

              {/* Detailed Spec List */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-0.5">
                    Geographic Coordinates
                  </span>
                  <div className="p-2 rounded bg-surface font-mono text-on-surface border border-outline-variant/40 flex items-center justify-between">
                    <span>
                      {selectedRequest.lat.toFixed(6)}° N, {selectedRequest.lng.toFixed(6)}° W
                    </span>
                    <span className="material-symbols-outlined text-primary text-base">
                      pin_drop
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-0.5">
                    Medical Needs Flag
                  </span>
                  <div className="p-2 rounded bg-surface text-on-surface border border-outline-variant/40 flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-base ${
                        selectedRequest.medicalNeeds ? 'text-tertiary' : 'text-outline'
                      }`}
                    >
                      {selectedRequest.medicalNeeds
                        ? 'medical_services'
                        : 'check_box_outline_blank'}
                    </span>
                    <span>
                      {selectedRequest.medicalNeeds
                        ? 'High-priority medical needs reported'
                        : 'No critical medical assistance reported'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-0.5">
                    Field Notes &amp; Situation
                  </span>
                  <p className="p-3 rounded bg-surface border border-outline-variant/40 text-on-surface leading-relaxed">
                    {selectedRequest.notes || 'No specific caller instructions logged.'}
                  </p>
                </div>

                {selectedRequest.isFlaggedDuplicate && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-800">
                      <span className="material-symbols-outlined text-[16px]">warning</span>
                      <span>Potential Duplicate Detected</span>
                    </div>
                    <p className="text-[11px] mt-1 text-amber-900">
                      Nearby report #{selectedRequest.duplicateOfId || 'associated ticket'} shares
                      coordinate proximity and similar head count.
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-[10px] uppercase font-mono text-on-surface-variant font-bold block mb-0.5">
                    Logged Timestamp
                  </span>
                  <div className="p-2 rounded bg-surface font-mono text-on-surface text-[11px] border border-outline-variant/40">
                    {selectedRequest.createdAt
                      ? new Date(selectedRequest.createdAt).toLocaleString()
                      : 'Unknown'}
                  </div>
                </div>
              </div>

              {/* Milestone 5 Non-Operational Action Controls */}
              <div className="pt-3 border-t border-outline-variant space-y-2">
                <div className="p-2.5 rounded bg-surface-container border border-outline-variant text-[11px] text-on-surface-variant">
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
            <div className="p-8 text-center text-on-surface-variant text-xs space-y-2">
              <span className="material-symbols-outlined text-3xl text-outline">touch_app</span>
              <p>Select a request from the table to inspect details.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function OperatorRequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-on-surface-variant font-mono text-xs">
          Loading Operator Requests Workspace...
        </div>
      }
    >
      <OperatorRequestsContent />
    </Suspense>
  );
}
