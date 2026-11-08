'use client';

import React, { useState } from 'react';
import { useOperationalEvents } from '@/hooks/useOperationalEvents';
import { LiveStatusIndicator } from '@/components/operator/LiveStatusIndicator';
import { EventFilters } from '@/components/operator/EventFilters';
import { OperationalEventFeed } from '@/components/operator/OperationalEventFeed';
import type { ListOperationalEventsFilter } from '@/lib/api/types';

const PAGE_SIZE = 24;

export default function OperationalEventsPage() {
  const [filters, setFilters] = useState<ListOperationalEventsFilter>({
    limit: PAGE_SIZE,
    offset: 0,
  });

  const {
    data: events = [],
    isLoading,
    isRefreshing,
    status,
    lastUpdated,
    refresh,
  } = useOperationalEvents({
    filters,
    intervalMs: 20000,
  });

  const currentOffset = filters.offset || 0;
  const currentLimit = filters.limit || PAGE_SIZE;

  const handleNextPage = () => {
    setFilters((prev) => ({
      ...prev,
      offset: (prev.offset || 0) + currentLimit,
    }));
  };

  const handlePrevPage = () => {
    setFilters((prev) => ({
      ...prev,
      offset: Math.max(0, (prev.offset || 0) - currentLimit),
    }));
  };

  const handleResetFilters = () => {
    setFilters({
      limit: PAGE_SIZE,
      offset: 0,
    });
  };

  return (
    <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-primary-container text-on-primary-container text-xs font-mono font-bold uppercase mb-2">
            <span className="material-symbols-outlined text-[14px]">radar</span>
            <span>Live Incident Stream</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-manrope text-on-surface tracking-tight">
            Operational Event Stream
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl mt-1">
            Real-time feed of rescue intake, fleet availability transitions, and road network
            disruptions recorded by the dispatch engine.
          </p>
        </div>

        {/* Polling & Refresh Beacon */}
        <div className="w-full md:w-auto">
          <LiveStatusIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            status={status}
          />
        </div>
      </div>

      {/* Filter Toolbar */}
      <EventFilters filters={filters} onChange={setFilters} onReset={handleResetFilters} />

      {/* Event Feed Cards */}
      <OperationalEventFeed events={events} isLoading={isLoading} onRefresh={refresh} />

      {/* Pagination Bar */}
      <div className="flex items-center justify-between pt-4 border-t border-outline-variant/30 text-xs font-mono text-on-surface-variant">
        <div>
          <span>
            Showing offset {currentOffset} – {currentOffset + events.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-on-surface hover:bg-surface-variant disabled:opacity-40 transition-colors font-semibold"
            disabled={currentOffset === 0 || isLoading}
            onClick={handlePrevPage}
            type="button"
          >
            ← Previous
          </button>
          <button
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-on-surface hover:bg-surface-variant disabled:opacity-40 transition-colors font-semibold"
            disabled={events.length < currentLimit || isLoading}
            onClick={handleNextPage}
            type="button"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
