'use client';

import React from 'react';
import type { SolverMetrics } from '@floodrelay/shared';

interface RepairMetricsProps {
  baselineMetrics?: SolverMetrics;
  repairedMetrics?: SolverMetrics;
  coverageDeltaPercent?: number;
  travelTimeDeltaMinutes?: number;
  highPriorityWaitDeltaMinutes?: number;
  unservedDelta?: number;
}

export default function RepairMetrics({
  baselineMetrics,
  repairedMetrics,
  coverageDeltaPercent = 0,
  travelTimeDeltaMinutes = 0,
  highPriorityWaitDeltaMinutes = 0,
  unservedDelta = 0,
}: RepairMetricsProps) {
  const baseCoverage = baselineMetrics?.coveragePercent ?? 0;
  const repCoverage = repairedMetrics?.coveragePercent ?? 0;

  const baseTravel = baselineMetrics?.totalTravelTimeMinutes ?? 0;
  const repTravel = repairedMetrics?.totalTravelTimeMinutes ?? 0;

  const baseWait = baselineMetrics?.highPriorityWaitTimeMinutes ?? 0;
  const repWait = repairedMetrics?.highPriorityWaitTimeMinutes ?? 0;

  const repServed = repairedMetrics?.servedRequestsCount ?? 0;
  const baseUnserved = baselineMetrics?.unservedRequestsCount ?? 0;
  const repUnserved = repairedMetrics?.unservedRequestsCount ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Coverage Metric */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3.5 flex flex-col justify-between shadow-xs">
        <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
          Population Coverage
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="text-2xl font-black font-mono text-on-surface">{repCoverage}%</div>
          <span
            className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
              coverageDeltaPercent > 0
                ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/50'
                : coverageDeltaPercent < 0
                  ? 'bg-red-900/30 text-red-400 border border-red-700/50'
                  : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {coverageDeltaPercent > 0 ? `+${coverageDeltaPercent}%` : `${coverageDeltaPercent}%`}
          </span>
        </div>
        <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
          Baseline: {baseCoverage}%
        </div>
      </div>

      {/* Travel Time Metric */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3.5 flex flex-col justify-between shadow-xs">
        <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
          Fleet Travel Time
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="text-2xl font-black font-mono text-on-surface">{repTravel}m</div>
          <span
            className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
              travelTimeDeltaMinutes < 0
                ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/50'
                : travelTimeDeltaMinutes > 0
                  ? 'bg-amber-900/30 text-amber-400 border border-amber-700/50'
                  : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {travelTimeDeltaMinutes > 0
              ? `+${travelTimeDeltaMinutes}m`
              : `${travelTimeDeltaMinutes}m`}
          </span>
        </div>
        <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
          Baseline: {baseTravel}m
        </div>
      </div>

      {/* High Priority Wait Metric */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3.5 flex flex-col justify-between shadow-xs">
        <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
          Critical / High Wait
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="text-2xl font-black font-mono text-on-surface">{repWait}m</div>
          <span
            className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
              highPriorityWaitDeltaMinutes < 0
                ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/50'
                : highPriorityWaitDeltaMinutes > 0
                  ? 'bg-red-900/30 text-red-400 border border-red-700/50'
                  : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {highPriorityWaitDeltaMinutes > 0
              ? `+${highPriorityWaitDeltaMinutes}m`
              : `${highPriorityWaitDeltaMinutes}m`}
          </span>
        </div>
        <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
          Baseline: {baseWait}m
        </div>
      </div>

      {/* Served / Unserved Demand Metric */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3.5 flex flex-col justify-between shadow-xs">
        <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
          Unserved Incidents
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="text-2xl font-black font-mono text-on-surface">{repUnserved}</div>
          <span
            className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
              unservedDelta < 0
                ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/50'
                : unservedDelta > 0
                  ? 'bg-red-900/30 text-red-400 border border-red-700/50'
                  : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {unservedDelta > 0 ? `+${unservedDelta}` : `${unservedDelta}`}
          </span>
        </div>
        <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
          Repaired: {repServed} served (Base unserved: {baseUnserved})
        </div>
      </div>
    </div>
  );
}
