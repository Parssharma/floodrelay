/**
 * Deterministic Repair Proposal Fixtures for Phase 5 Part 3
 *
 * Used for frontend demonstration and visual verification while the
 * Phase 5 Part 2 optimization solver is pending integration.
 *
 * All records are explicitly labeled with `simulated: true` and must
 * NEVER be committed to the operational database.
 */

import type { SolverPlan, RouteStop, ResourceRoute } from '@floodrelay/shared';
import type { RepairResult } from '@/lib/api/types';

export const SIMULATED_BASELINE_PLAN: SolverPlan = {
  scenarioId: 'harris-county-sector-4-baseline',
  calculatedAt: new Date(Date.now() - 3600000).toISOString(),
  solverStatus: 'COMMITTED',
  routes: [
    {
      resourceId: 'res-boat-alpha',
      totalTravelDistanceKm: 14.2,
      totalDurationMinutes: 52,
      servedRequestIds: ['req-101', 'req-102', 'req-103'],
      stops: [
        {
          stopNumber: 1,
          type: 'PICKUP',
          targetId: 'req-101',
          lat: 29.764,
          lng: -95.372,
          passengersPickedUp: 3,
          passengersDroppedOff: 0,
          estimatedArrivalMinutes: 12,
          isFrozen: true, // Already dispatched/en-route stop
        },
        {
          stopNumber: 2,
          type: 'PICKUP',
          targetId: 'req-102',
          lat: 29.771,
          lng: -95.385,
          passengersPickedUp: 2,
          passengersDroppedOff: 0,
          estimatedArrivalMinutes: 28,
          isFrozen: false,
        },
        {
          stopNumber: 3,
          type: 'PICKUP',
          targetId: 'req-103',
          lat: 29.782,
          lng: -95.395,
          passengersPickedUp: 2,
          passengersDroppedOff: 0,
          estimatedArrivalMinutes: 44,
          isFrozen: false,
        },
        {
          stopNumber: 4,
          type: 'DROPOFF',
          targetId: 'shelter-westchase',
          lat: 29.721,
          lng: -95.558,
          passengersPickedUp: 0,
          passengersDroppedOff: 7,
          estimatedArrivalMinutes: 52,
          isFrozen: false,
        },
      ],
    },
    {
      resourceId: 'res-truck-heavy',
      totalTravelDistanceKm: 18.6,
      totalDurationMinutes: 64,
      servedRequestIds: ['req-104', 'req-105'],
      stops: [
        {
          stopNumber: 1,
          type: 'PICKUP',
          targetId: 'req-104',
          lat: 29.754,
          lng: -95.352,
          passengersPickedUp: 4,
          passengersDroppedOff: 0,
          estimatedArrivalMinutes: 18,
          isFrozen: true, // Dispatched
        },
        {
          stopNumber: 2,
          type: 'PICKUP',
          targetId: 'req-105',
          lat: 29.742,
          lng: -95.341,
          passengersPickedUp: 3,
          passengersDroppedOff: 0,
          estimatedArrivalMinutes: 38,
          isFrozen: false,
        },
        {
          stopNumber: 3,
          type: 'DROPOFF',
          targetId: 'shelter-nrg',
          lat: 29.684,
          lng: -95.411,
          passengersPickedUp: 0,
          passengersDroppedOff: 7,
          estimatedArrivalMinutes: 64,
          isFrozen: false,
        },
      ],
    },
  ],
  unserved: [
    {
      requestId: 'req-106',
      reason: 'CAPACITY_EXCEEDED',
      details: 'No available boat with sufficient free draft capacity',
    },
    {
      requestId: 'req-107',
      reason: 'NO_REACHABLE_RESOURCE',
      details: 'Location blocked by road surge hazard at Heights Blvd',
    },
  ],
  metrics: {
    coveragePercent: 71.4,
    totalTravelTimeMinutes: 116,
    totalTravelDistanceKm: 32.8,
    highPriorityWaitTimeMinutes: 28,
    solveDurationMs: 420,
    servedRequestsCount: 5,
    unservedRequestsCount: 2,
  },
};

export const SIMULATED_REPAIR_RESULT: RepairResult = {
  status: 'PROPOSED',
  baselineVersion: 1,
  warnings: [
    'Stop #1 on Boat Alpha (req-101) is FROZEN and preserved in place.',
    'Stop #1 on Truck Heavy (req-104) is FROZEN and preserved in place.',
    'Road hazard zone Z-402 (Heights Blvd) bypassed by rerouting req-107 to Rotary Hawk-1.',
    'Reassigned req-103 from Boat Alpha to Truck Heavy to reduce total vessel churn.',
  ],
  unservedRequestIds: ['req-106'],
  proposedPlan: {
    scenarioId: 'harris-county-sector-4-repaired',
    calculatedAt: new Date().toISOString(),
    solverStatus: 'PROPOSED',
    routes: [
      {
        resourceId: 'res-boat-alpha',
        totalTravelDistanceKm: 11.8,
        totalDurationMinutes: 44,
        servedRequestIds: ['req-101', 'req-102'],
        stops: [
          {
            stopNumber: 1,
            type: 'PICKUP',
            targetId: 'req-101',
            lat: 29.764,
            lng: -95.372,
            passengersPickedUp: 3,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 12,
            isFrozen: true, // Preserved
          },
          {
            stopNumber: 2,
            type: 'PICKUP',
            targetId: 'req-102',
            lat: 29.771,
            lng: -95.385,
            passengersPickedUp: 2,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 26,
            isFrozen: false,
          },
          {
            stopNumber: 3,
            type: 'DROPOFF',
            targetId: 'shelter-westchase',
            lat: 29.721,
            lng: -95.558,
            passengersPickedUp: 0,
            passengersDroppedOff: 5,
            estimatedArrivalMinutes: 44,
            isFrozen: false,
          },
        ],
      },
      {
        resourceId: 'res-truck-heavy',
        totalTravelDistanceKm: 21.4,
        totalDurationMinutes: 68,
        servedRequestIds: ['req-104', 'req-103', 'req-105'],
        stops: [
          {
            stopNumber: 1,
            type: 'PICKUP',
            targetId: 'req-104',
            lat: 29.754,
            lng: -95.352,
            passengersPickedUp: 4,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 18,
            isFrozen: true, // Preserved
          },
          {
            stopNumber: 2,
            type: 'PICKUP',
            targetId: 'req-103', // Reassigned from Boat Alpha!
            lat: 29.782,
            lng: -95.395,
            passengersPickedUp: 2,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 34,
            isFrozen: false,
          },
          {
            stopNumber: 3,
            type: 'PICKUP',
            targetId: 'req-105',
            lat: 29.742,
            lng: -95.341,
            passengersPickedUp: 3,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 48,
            isFrozen: false,
          },
          {
            stopNumber: 4,
            type: 'DROPOFF',
            targetId: 'shelter-nrg',
            lat: 29.684,
            lng: -95.411,
            passengersPickedUp: 0,
            passengersDroppedOff: 9,
            estimatedArrivalMinutes: 68,
            isFrozen: false,
          },
        ],
      },
      {
        resourceId: 'res-hawk-1', // Newly activated resource!
        totalTravelDistanceKm: 12.0,
        totalDurationMinutes: 16,
        servedRequestIds: ['req-107'],
        stops: [
          {
            stopNumber: 1,
            type: 'PICKUP',
            targetId: 'req-107', // Previously unserved, now rescued!
            lat: 29.735,
            lng: -95.362,
            passengersPickedUp: 2,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 8,
            isFrozen: false,
          },
          {
            stopNumber: 2,
            type: 'DROPOFF',
            targetId: 'shelter-nrg',
            lat: 29.684,
            lng: -95.411,
            passengersPickedUp: 0,
            passengersDroppedOff: 2,
            estimatedArrivalMinutes: 16,
            isFrozen: false,
          },
        ],
      },
    ],
    unserved: [
      {
        requestId: 'req-106',
        reason: 'CAPACITY_EXCEEDED',
        details: 'Draft depth too shallow; staging dedicated hovercraft',
      },
    ],
    metrics: {
      coveragePercent: 85.7,
      totalTravelTimeMinutes: 128,
      totalTravelDistanceKm: 45.2,
      highPriorityWaitTimeMinutes: 14,
      solveDurationMs: 380,
      servedRequestsCount: 6,
      unservedRequestsCount: 1,
    },
  },
};

export type StopDiffStatus =
  'UNCHANGED' | 'FROZEN' | 'ADDED' | 'REMOVED' | 'REASSIGNED' | 'REORDERED';

export interface StopDiffItem {
  targetId: string;
  type: string;
  status: StopDiffStatus;
  baselineResourceId?: string;
  repairedResourceId?: string;
  baselineStopNumber?: number;
  repairedStopNumber?: number;
  isFrozen: boolean;
  passengers: number;
  notes?: string;
}

export interface RepairDiffAnalysis {
  stopDiffs: StopDiffItem[];
  churnPercent: number;
  movedRequestsCount: number;
  addedStopsCount: number;
  removedStopsCount: number;
  reassignedStopsCount: number;
  reorderedStopsCount: number;
  frozenStopsCount: number;
  unchangedStopsCount: number;
  unservedDelta: number;
  travelTimeDeltaMinutes: number;
  coverageDeltaPercent: number;
  highPriorityWaitDeltaMinutes: number;
}

/**
 * Computes a deterministic diff analysis comparing a baseline plan with a repaired plan.
 */
export function computeRepairDiff(baseline: SolverPlan, repaired: SolverPlan): RepairDiffAnalysis {
  const baselineStopsMap = new Map<string, { route: ResourceRoute; stop: RouteStop }>();
  for (const route of baseline.routes) {
    for (const stop of route.stops) {
      baselineStopsMap.set(`${stop.targetId}:${stop.type}`, { route, stop });
    }
  }

  const repairedStopsMap = new Map<string, { route: ResourceRoute; stop: RouteStop }>();
  for (const route of repaired.routes) {
    for (const stop of route.stops) {
      repairedStopsMap.set(`${stop.targetId}:${stop.type}`, { route, stop });
    }
  }

  const allKeys = new Set([
    ...Array.from(baselineStopsMap.keys()),
    ...Array.from(repairedStopsMap.keys()),
  ]);

  const stopDiffs: StopDiffItem[] = [];
  let movedRequestsCount = 0;
  let addedStopsCount = 0;
  let removedStopsCount = 0;
  let reassignedStopsCount = 0;
  let reorderedStopsCount = 0;
  let frozenStopsCount = 0;
  let unchangedStopsCount = 0;

  for (const key of Array.from(allKeys)) {
    const base = baselineStopsMap.get(key);
    const rep = repairedStopsMap.get(key);

    if (base && !rep) {
      removedStopsCount++;
      movedRequestsCount++;
      stopDiffs.push({
        targetId: base.stop.targetId,
        type: base.stop.type,
        status: 'REMOVED',
        baselineResourceId: base.route.resourceId,
        baselineStopNumber: base.stop.stopNumber,
        isFrozen: false,
        passengers: base.stop.passengersPickedUp || base.stop.passengersDroppedOff,
        notes: `Removed from ${base.route.resourceId}`,
      });
    } else if (!base && rep) {
      addedStopsCount++;
      movedRequestsCount++;
      stopDiffs.push({
        targetId: rep.stop.targetId,
        type: rep.stop.type,
        status: 'ADDED',
        repairedResourceId: rep.route.resourceId,
        repairedStopNumber: rep.stop.stopNumber,
        isFrozen: rep.stop.isFrozen || false,
        passengers: rep.stop.passengersPickedUp || rep.stop.passengersDroppedOff,
        notes: `Added to ${rep.route.resourceId}`,
      });
    } else if (base && rep) {
      const isFrozen = rep.stop.isFrozen || base.stop.isFrozen || false;
      const sameResource = base.route.resourceId === rep.route.resourceId;
      const sameOrder = base.stop.stopNumber === rep.stop.stopNumber;

      if (isFrozen) {
        frozenStopsCount++;
        stopDiffs.push({
          targetId: rep.stop.targetId,
          type: rep.stop.type,
          status: 'FROZEN',
          baselineResourceId: base.route.resourceId,
          repairedResourceId: rep.route.resourceId,
          baselineStopNumber: base.stop.stopNumber,
          repairedStopNumber: rep.stop.stopNumber,
          isFrozen: true,
          passengers: rep.stop.passengersPickedUp || rep.stop.passengersDroppedOff,
          notes: 'Frozen stop preserved in position',
        });
      } else if (!sameResource) {
        reassignedStopsCount++;
        movedRequestsCount++;
        stopDiffs.push({
          targetId: rep.stop.targetId,
          type: rep.stop.type,
          status: 'REASSIGNED',
          baselineResourceId: base.route.resourceId,
          repairedResourceId: rep.route.resourceId,
          baselineStopNumber: base.stop.stopNumber,
          repairedStopNumber: rep.stop.stopNumber,
          isFrozen: false,
          passengers: rep.stop.passengersPickedUp || rep.stop.passengersDroppedOff,
          notes: `Reassigned: ${base.route.resourceId} → ${rep.route.resourceId}`,
        });
      } else if (!sameOrder) {
        reorderedStopsCount++;
        movedRequestsCount++;
        stopDiffs.push({
          targetId: rep.stop.targetId,
          type: rep.stop.type,
          status: 'REORDERED',
          baselineResourceId: base.route.resourceId,
          repairedResourceId: rep.route.resourceId,
          baselineStopNumber: base.stop.stopNumber,
          repairedStopNumber: rep.stop.stopNumber,
          isFrozen: false,
          passengers: rep.stop.passengersPickedUp || rep.stop.passengersDroppedOff,
          notes: `Sequence shifted: Stop #${base.stop.stopNumber} → #${rep.stop.stopNumber}`,
        });
      } else {
        unchangedStopsCount++;
        stopDiffs.push({
          targetId: rep.stop.targetId,
          type: rep.stop.type,
          status: 'UNCHANGED',
          baselineResourceId: base.route.resourceId,
          repairedResourceId: rep.route.resourceId,
          baselineStopNumber: base.stop.stopNumber,
          repairedStopNumber: rep.stop.stopNumber,
          isFrozen: false,
          passengers: rep.stop.passengersPickedUp || rep.stop.passengersDroppedOff,
        });
      }
    }
  }

  const totalBaselineStops = baselineStopsMap.size || 1;
  const churnPercent = Math.min(100, Math.round((movedRequestsCount / totalBaselineStops) * 100));

  const baselineUnservedCount = baseline.unserved?.length ?? 0;
  const repairedUnservedCount = repaired.unserved?.length ?? 0;
  const unservedDelta = repairedUnservedCount - baselineUnservedCount;

  const baselineTravelTime = baseline.metrics?.totalTravelTimeMinutes ?? 0;
  const repairedTravelTime = repaired.metrics?.totalTravelTimeMinutes ?? 0;
  const travelTimeDeltaMinutes = repairedTravelTime - baselineTravelTime;

  const baselineCoverage = baseline.metrics?.coveragePercent ?? 0;
  const repairedCoverage = repaired.metrics?.coveragePercent ?? 0;
  const coverageDeltaPercent = Number((repairedCoverage - baselineCoverage).toFixed(1));

  const baselineWait = baseline.metrics?.highPriorityWaitTimeMinutes ?? 0;
  const repairedWait = repaired.metrics?.highPriorityWaitTimeMinutes ?? 0;
  const highPriorityWaitDeltaMinutes = repairedWait - baselineWait;

  return {
    stopDiffs,
    churnPercent,
    movedRequestsCount,
    addedStopsCount,
    removedStopsCount,
    reassignedStopsCount,
    reorderedStopsCount,
    frozenStopsCount,
    unchangedStopsCount,
    unservedDelta,
    travelTimeDeltaMinutes,
    coverageDeltaPercent,
    highPriorityWaitDeltaMinutes,
  };
}
