'use client';

import React from 'react';

interface ChurnSummaryProps {
  churnPercent: number;
  movedRequestsCount: number;
  addedStopsCount: number;
  removedStopsCount: number;
  reassignedStopsCount: number;
  reorderedStopsCount: number;
  frozenStopsCount: number;
  unchangedStopsCount: number;
}

export default function ChurnSummary({
  churnPercent,
  movedRequestsCount,
  addedStopsCount,
  removedStopsCount,
  reassignedStopsCount,
  reorderedStopsCount,
  frozenStopsCount,
  unchangedStopsCount,
}: ChurnSummaryProps) {
  const getChurnSeverity = (pct: number) => {
    if (pct <= 20) {
      return {
        label: 'Low Churn — Minimal field disruption',
        badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40',
        barClass: 'bg-emerald-500',
      };
    }
    if (pct <= 45) {
      return {
        label: 'Moderate Churn — Manageable route adjustments',
        badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-500/40',
        barClass: 'bg-amber-500',
      };
    }
    return {
      label: 'High Churn — Significant redeployment of resources',
      badgeClass: 'bg-red-950/40 text-red-300 border-red-500/40',
      barClass: 'bg-red-500',
    };
  };

  const severity = getChurnSeverity(churnPercent);

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-4">
      {/* Churn Header & Progress Bar */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-lg">
              published_with_changes
            </span>
            <span className="text-sm font-bold text-on-surface">
              Plan Churn & Stability Analysis
            </span>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 w-fit ${severity.badgeClass}`}
          >
            <span className="font-mono font-bold">{churnPercent}% Churn</span>
            <span>•</span>
            <span>{severity.label}</span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-surface-container-highest h-2.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${severity.barClass}`}
            style={{ width: `${Math.min(churnPercent, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-on-surface-variant font-mono mt-1">
          <span>0% (No change)</span>
          <span>{movedRequestsCount} modified request assignments</span>
          <span>100% (Total overhaul)</span>
        </div>
      </div>

      {/* Stop Changes Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1 border-t border-outline-variant/20">
        {/* Frozen */}
        <div className="bg-surface-container-lowest/80 border border-amber-500/30 rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[13px]">lock</span>
            Frozen
          </div>
          <div className="text-lg font-black font-mono text-on-surface mt-1">
            {frozenStopsCount}
          </div>
          <div className="text-[9px] text-on-surface-variant mt-0.5">Preserved in place</div>
        </div>

        {/* Reassigned */}
        <div className="bg-surface-container-lowest/80 border border-sky-500/30 rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[13px]">swap_horiz</span>
            Reassigned
          </div>
          <div className="text-lg font-black font-mono text-on-surface mt-1">
            {reassignedStopsCount}
          </div>
          <div className="text-[9px] text-on-surface-variant mt-0.5">Moved to new vehicle</div>
        </div>

        {/* Reordered */}
        <div className="bg-surface-container-lowest/80 border border-purple-500/30 rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[13px]">reorder</span>
            Reordered
          </div>
          <div className="text-lg font-black font-mono text-on-surface mt-1">
            {reorderedStopsCount}
          </div>
          <div className="text-[9px] text-on-surface-variant mt-0.5">Sequence shifted</div>
        </div>

        {/* Added */}
        <div className="bg-surface-container-lowest/80 border border-emerald-500/30 rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[13px]">add_circle</span>
            Added
          </div>
          <div className="text-lg font-black font-mono text-on-surface mt-1">{addedStopsCount}</div>
          <div className="text-[9px] text-on-surface-variant mt-0.5">Newly scheduled</div>
        </div>

        {/* Removed */}
        <div className="bg-surface-container-lowest/80 border border-red-500/30 rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[13px]">delete</span>
            Dropped
          </div>
          <div className="text-lg font-black font-mono text-on-surface mt-1">
            {removedStopsCount}
          </div>
          <div className="text-[9px] text-on-surface-variant mt-0.5">Deferred to unserved</div>
        </div>

        {/* Unchanged */}
        <div className="bg-surface-container-lowest/80 border border-outline-variant/30 rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[13px]">check_circle</span>
            Unchanged
          </div>
          <div className="text-lg font-black font-mono text-on-surface mt-1">
            {unchangedStopsCount}
          </div>
          <div className="text-[9px] text-on-surface-variant mt-0.5">Identical position</div>
        </div>
      </div>
    </div>
  );
}
