import type { OperationalEvent, AffectedScopeResult } from '@floodrelay/shared';
import type { PostgisRepository } from '../db/repository.js';

export class AffectedScopeService {
  constructor(private readonly repo: PostgisRepository) {}

  /**
   * Evaluates the planning scope affected by an operational event without mutating any assignments.
   */
  async computeAffectedScope(event: OperationalEvent): Promise<AffectedScopeResult> {
    const affectedRequestIds = new Set<string>();
    const affectedResourceIds = new Set<string>();
    const affectedProposedAssignmentIds = new Set<string>();
    const committedAssignmentsRequiringReview = new Set<string>();
    let reason: string;
    let repairEligible: boolean;

    switch (event.type) {
      case 'REQUEST_CREATED':
      case 'REQUEST_FLAGGED_DUPLICATE': {
        const reqId = event.entityId;
        affectedRequestIds.add(reqId);
        if (event.payload?.duplicateOfId && typeof event.payload.duplicateOfId === 'string') {
          affectedRequestIds.add(event.payload.duplicateOfId);
        }

        // Find all currently proposed assignments that may incorporate this new demand
        const proposed = await this.repo.listAssignments({ status: 'PROPOSED' });
        for (const assign of proposed) {
          affectedProposedAssignmentIds.add(assign.id);
        }

        // Identify available resources
        const availableResources = await this.repo.listResources({ status: 'AVAILABLE' });
        for (const res of availableResources) {
          affectedResourceIds.add(res.id);
        }

        reason =
          event.type === 'REQUEST_FLAGGED_DUPLICATE'
            ? `New request "${reqId}" flagged as potential duplicate; evaluate impact on existing demand`
            : `New rescue request "${reqId}" recorded; eligible for assignment to active resources`;
        repairEligible = true;
        break;
      }

      case 'REQUEST_CANCELLED': {
        const reqId = event.entityId;
        affectedRequestIds.add(reqId);

        // Check all proposed assignments referencing this request
        const proposed = await this.repo.listAssignments({ status: 'PROPOSED' });
        for (const assign of proposed) {
          const detail = await this.repo.getAssignmentWithStops(assign.id);
          if (detail && detail.stops) {
            for (const s of detail.stops) {
              if (s.target_id === reqId) {
                affectedProposedAssignmentIds.add(assign.id);
                affectedResourceIds.add(s.resource_id);
              }
            }
          }
        }

        // Check all committed assignments referencing this request
        const committed = await this.repo.listAssignments({ status: 'COMMITTED' });
        for (const assign of committed) {
          const detail = await this.repo.getAssignmentWithStops(assign.id);
          if (detail && detail.stops) {
            for (const s of detail.stops) {
              if (s.target_id === reqId) {
                committedAssignmentsRequiringReview.add(assign.id);
                affectedResourceIds.add(s.resource_id);
              }
            }
          }
        }

        reason = `Rescue request "${reqId}" was cancelled; mutable proposals should be updated, committed assignments flagged for operator review`;
        repairEligible = true;
        break;
      }

      case 'RESOURCE_OFFLINE': {
        const resId = event.entityId;
        affectedResourceIds.add(resId);

        // Check all proposed assignments using this resource
        const proposed = await this.repo.listAssignments({ status: 'PROPOSED' });
        for (const assign of proposed) {
          const detail = await this.repo.getAssignmentWithStops(assign.id);
          if (detail && detail.stops) {
            for (const s of detail.stops) {
              if (s.resource_id === resId) {
                affectedProposedAssignmentIds.add(assign.id);
                if (s.type === 'PICKUP') {
                  affectedRequestIds.add(s.target_id);
                }
              }
            }
          }
        }

        // Check all committed assignments using this resource
        const committed = await this.repo.listAssignments({ status: 'COMMITTED' });
        for (const assign of committed) {
          const detail = await this.repo.getAssignmentWithStops(assign.id);
          if (detail && detail.stops) {
            for (const s of detail.stops) {
              if (s.resource_id === resId) {
                committedAssignmentsRequiringReview.add(assign.id);
                if (s.type === 'PICKUP') {
                  affectedRequestIds.add(s.target_id);
                }
              }
            }
          }
        }

        reason = `Resource "${resId}" is OFFLINE; routes assigned to this resource require reassignment`;
        repairEligible = true;
        break;
      }

      case 'RESOURCE_AVAILABLE': {
        const resId = event.entityId;
        affectedResourceIds.add(resId);

        // Find all pending or unassigned requests that this resource could serve
        const pending = await this.repo.listRequests({ status: 'PENDING' });
        for (const req of pending) {
          affectedRequestIds.add(req.id);
        }

        reason = `Resource "${resId}" is now AVAILABLE; eligible to serve pending rescue requests`;
        repairEligible = true;
        break;
      }

      case 'ROAD_BLOCKED':
      case 'ROAD_REOPENED': {
        const zoneId = event.entityId;
        const proposed = await this.repo.listAssignments({ status: 'PROPOSED' });
        for (const assign of proposed) {
          affectedProposedAssignmentIds.add(assign.id);
        }

        const committed = await this.repo.listAssignments({ status: 'COMMITTED' });
        for (const assign of committed) {
          committedAssignmentsRequiringReview.add(assign.id);
        }

        reason =
          event.type === 'ROAD_BLOCKED'
            ? `Road zone "${zoneId}" blocked; traversing routes require hazard re-evaluation`
            : `Road zone "${zoneId}" reopened; opportunities for route re-optimization available`;
        repairEligible = true;
        break;
      }

      default: {
        reason = `Event type "${event.type}" recorded; general scope inspection`;
        repairEligible = false;
      }
    }

    return {
      eventId: event.id,
      affectedRequestIds: Array.from(affectedRequestIds),
      affectedResourceIds: Array.from(affectedResourceIds),
      affectedProposedAssignmentIds: Array.from(affectedProposedAssignmentIds),
      committedAssignmentsRequiringReview: Array.from(committedAssignmentsRequiringReview),
      reason,
      repairEligible,
    };
  }
}
