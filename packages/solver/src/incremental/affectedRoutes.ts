import type { ResourceRoute, SolverPlan } from '@floodrelay/shared';
import type { OperationalEvent } from './types.js';

/**
 * Identifies which resource routes in a plan are affected by an operational event.
 */
export function identifyAffectedResourceIds(plan: SolverPlan, event: OperationalEvent): string[] {
  switch (event.type) {
    case 'REQUEST_CREATED': {
      // Potentially any active or idle resource can be affected by an insertion
      return plan.routes.map((r) => r.resourceId);
    }

    case 'RESOURCE_OFFLINE': {
      return [event.resourceId];
    }

    case 'REQUEST_CANCELLED': {
      for (const route of plan.routes) {
        if (route.stops.some((s) => s.type === 'PICKUP' && s.targetId === event.requestId)) {
          return [route.resourceId];
        }
      }
      return [];
    }

    case 'ROAD_BLOCKED': {
      // Routes are checked for physical intersection with the blocked zone
      return plan.routes.map((r) => r.resourceId);
    }

    case 'RESOURCE_AVAILABLE': {
      return [event.resourceId];
    }

    default:
      return [];
  }
}

/**
 * Partitions a plan's routes into affected and unaffected subsets.
 */
export function partitionRoutes(
  plan: SolverPlan,
  affectedResourceIds: ReadonlyArray<string>,
): {
  affected: ResourceRoute[];
  unaffected: ResourceRoute[];
} {
  const affectedSet = new Set(affectedResourceIds);
  const affected: ResourceRoute[] = [];
  const unaffected: ResourceRoute[] = [];

  for (const route of plan.routes) {
    if (affectedSet.has(route.resourceId)) {
      affected.push(route);
    } else {
      unaffected.push(route);
    }
  }

  return { affected, unaffected };
}
