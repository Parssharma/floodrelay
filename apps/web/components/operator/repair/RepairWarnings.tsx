'use client';

import React from 'react';
import type { UnservedRequest } from '@floodrelay/shared';

interface RepairWarningsProps {
  warnings?: string[];
  unservedRequests?: UnservedRequest[];
}

export default function RepairWarnings({
  warnings = [],
  unservedRequests = [],
}: RepairWarningsProps) {
  if (warnings.length === 0 && unservedRequests.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Solver Constraint Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>Solver Operational Constraints & Hazard Warnings</span>
          </div>
          <ul className="space-y-1.5 text-xs text-on-surface-variant">
            {warnings.map((w, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-amber-500 font-bold">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Unserved Demand Breakdown */}
      {unservedRequests.length > 0 && (
        <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
            <span className="material-symbols-outlined text-sm">person_off</span>
            <span>Unserved Incidents in Repaired Plan ({unservedRequests.length})</span>
          </div>
          <ul className="space-y-1.5 text-xs text-on-surface-variant">
            {unservedRequests.map((u, idx) => (
              <li key={idx} className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1">
                  <span className="font-mono font-bold text-on-surface">{u.requestId}:</span>
                  <span className="text-[11px] font-semibold text-red-300">
                    {u.reason.replace(/_/g, ' ')}
                  </span>
                </div>
                {u.details && (
                  <span className="text-[10px] text-on-surface-variant text-right">
                    {u.details}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
