'use client';

import React, { useState, useMemo } from 'react';
import type { StopDiffItem, StopDiffStatus } from '@/lib/fixtures/repairFixtures';

interface ChangedStopListProps {
  stopDiffs: StopDiffItem[];
}

export default function ChangedStopList({ stopDiffs }: ChangedStopListProps) {
  const [filter, setFilter] = useState<'ALL' | 'CHANGED_ONLY' | 'FROZEN' | 'REASSIGNED'>('ALL');

  const filteredStops = useMemo(() => {
    return stopDiffs.filter((item) => {
      if (filter === 'CHANGED_ONLY') {
        return item.status !== 'UNCHANGED';
      }
      if (filter === 'FROZEN') {
        return item.status === 'FROZEN';
      }
      if (filter === 'REASSIGNED') {
        return item.status === 'REASSIGNED';
      }
      return true;
    });
  }, [stopDiffs, filter]);

  const getStatusBadge = (status: StopDiffStatus) => {
    switch (status) {
      case 'FROZEN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-500/50">
            <span className="material-symbols-outlined text-[12px]">lock</span>
            FROZEN
          </span>
        );
      case 'ADDED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/50">
            <span className="material-symbols-outlined text-[12px]">add_circle</span>
            ADDED
          </span>
        );
      case 'REMOVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950/60 text-red-300 border border-red-500/50">
            <span className="material-symbols-outlined text-[12px]">delete</span>
            REMOVED
          </span>
        );
      case 'REASSIGNED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950/60 text-sky-300 border border-sky-500/50">
            <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
            REASSIGNED
          </span>
        );
      case 'REORDERED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/60 text-purple-300 border border-purple-500/50">
            <span className="material-symbols-outlined text-[12px]">reorder</span>
            REORDERED
          </span>
        );
      case 'UNCHANGED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-container text-on-surface-variant border border-outline-variant/30">
            <span className="material-symbols-outlined text-[12px]">check</span>
            UNCHANGED
          </span>
        );
    }
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl overflow-hidden">
      {/* List Header and Filter Tabs */}
      <div className="p-3.5 border-b border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary text-base">
            format_list_bulleted
          </span>
          <span className="text-sm font-bold text-on-surface">
            Stop-by-Stop Modification Breakdown
          </span>
          <span className="text-xs text-on-surface-variant font-mono">
            ({filteredStops.length})
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/20 text-xs">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${
              filter === 'ALL'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            All Stops ({stopDiffs.length})
          </button>
          <button
            onClick={() => setFilter('CHANGED_ONLY')}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${
              filter === 'CHANGED_ONLY'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            Changed Only
          </button>
          <button
            onClick={() => setFilter('FROZEN')}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${
              filter === 'FROZEN'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            Frozen
          </button>
          <button
            onClick={() => setFilter('REASSIGNED')}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${
              filter === 'REASSIGNED'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            Reassigned
          </button>
        </div>
      </div>

      {/* Table / List */}
      <div className="divide-y divide-outline-variant/10 max-h-96 overflow-y-auto">
        {filteredStops.length === 0 ? (
          <div className="p-8 text-center text-xs text-on-surface-variant">
            No stops match the selected filter.
          </div>
        ) : (
          filteredStops.map((item, idx) => (
            <div
              key={`${item.targetId}-${item.type}-${idx}`}
              className="p-3 hover:bg-surface-container-lowest/60 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getStatusBadge(item.status)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-on-surface text-sm">
                      {item.targetId}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        item.type === 'PICKUP'
                          ? 'bg-amber-950/40 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      {item.passengers} pax
                    </span>
                  </div>

                  {item.notes && (
                    <div className="text-[11px] text-on-surface-variant mt-0.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-tertiary">
                        arrow_right_alt
                      </span>
                      <span>{item.notes}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Resource & Stop Number Transition */}
              <div className="flex items-center gap-4 text-[11px] font-mono shrink-0 self-end sm:self-center">
                <div className="text-right">
                  <div className="text-[10px] text-on-surface-variant uppercase">Vehicle</div>
                  <div className="font-semibold text-on-surface">
                    {item.baselineResourceId === item.repairedResourceId ? (
                      item.repairedResourceId || item.baselineResourceId
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="line-through text-on-surface-variant">
                          {item.baselineResourceId || 'None'}
                        </span>
                        <span className="text-sky-400 font-bold">→</span>
                        <span className="text-sky-300 font-bold">
                          {item.repairedResourceId || 'None'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right min-w-[60px]">
                  <div className="text-[10px] text-on-surface-variant uppercase">Stop #</div>
                  <div className="font-semibold text-on-surface">
                    {item.baselineStopNumber === item.repairedStopNumber ? (
                      `#${item.repairedStopNumber || item.baselineStopNumber}`
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="line-through text-on-surface-variant">
                          #{item.baselineStopNumber}
                        </span>
                        <span className="text-purple-400 font-bold">→</span>
                        <span className="text-purple-300 font-bold">
                          #{item.repairedStopNumber}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
