import type {
  BlockedZone,
  RescueRequest,
  ResourceRoute,
  RouteStop,
  Scenario,
  SolverPlan,
  UnservedReason,
} from '@floodrelay/shared';
import type { TravelTimeProvider } from '../routing/travelTime.js';

export type OperationalEventType =
  | 'REQUEST_CREATED'
  | 'RESOURCE_OFFLINE'
  | 'REQUEST_CANCELLED'
  | 'ROAD_BLOCKED'
  | 'RESOURCE_AVAILABLE';

export interface OperationalEventBase {
  id: string;
  type: OperationalEventType;
  timestamp: string;
}

export interface RequestCreatedEvent extends OperationalEventBase {
  type: 'REQUEST_CREATED';
  request: RescueRequest;
}

export interface ResourceOfflineEvent extends OperationalEventBase {
  type: 'RESOURCE_OFFLINE';
  resourceId: string;
  reason?: string;
}

export interface RequestCancelledEvent extends OperationalEventBase {
  type: 'REQUEST_CANCELLED';
  requestId: string;
  reason?: string;
  isDuplicateResolution?: boolean;
}

export interface RoadBlockedEvent extends OperationalEventBase {
  type: 'ROAD_BLOCKED';
  blockedZone: BlockedZone;
}

export interface ResourceAvailableEvent extends OperationalEventBase {
  type: 'RESOURCE_AVAILABLE';
  resourceId: string;
}

export type OperationalEvent =
  | RequestCreatedEvent
  | ResourceOfflineEvent
  | RequestCancelledEvent
  | RoadBlockedEvent
  | ResourceAvailableEvent;

export interface IncrementalRepairInput {
  event: OperationalEvent;
  scenario: Scenario;
  baselinePlan: SolverPlan;
  frozenStopIds?: ReadonlyArray<string>;
  affectedRequestIds?: ReadonlyArray<string>;
  affectedResourceIds?: ReadonlyArray<string>;
  travelTimeProvider?: TravelTimeProvider;
  maxShiftMinutes?: number;
  toleranceMinutes?: number;
}

export type RepairStatus = 'PROPOSED' | 'NO_FEASIBLE_REPAIR';

export interface IncrementalChurnMetrics {
  comparableExistingAssignments: number;
  reassignedRequestsCount: number;
  reorderedStopsCount: number;
  newlyServedRequestsCount: number;
  newlyUnservedRequestsCount: number;
  travelTimeDeltaMinutes: number;
  travelDistanceDeltaKm: number;
  frozenStopsViolated: number;
  assignmentChurnRate: number;
  churnPercent: number;
  reassignedRequestIds: string[];
  reorderedStopKeys: string[];
  newlyServedRequestIds: string[];
  newlyUnservedRequestIds: string[];
}

export interface IncrementalRepairResult {
  status: RepairStatus;
  repairedPlan?: SolverPlan;
  affectedRouteResourceIds: string[];
  unchangedRouteResourceIds: string[];
  unservedRequestIds: string[];
  warnings: string[];
  churn: IncrementalChurnMetrics;
  travelTimeDeltaMinutes: number;
  repairReason?: string;
}

export interface FeasibleRouteEvaluation {
  feasible: boolean;
  route?: ResourceRoute;
  incrementalDurationMinutes: number;
  incrementalDistanceKm: number;
  infeasibilityReason?: UnservedReason | string;
}

export interface CandidateInsertionOption {
  resourceId: string;
  pickupIndex: number;
  dropoffIndex: number;
  shelterId: string;
  isExistingDropoff: boolean;
  isNewRoute: boolean;
  evaluatedRoute: ResourceRoute;
  incrementalDurationMinutes: number;
  incrementalDistanceKm: number;
  objectiveScore: number;
}

export interface FrozenStopRecord {
  resourceId: string;
  stopNumber: number;
  type: RouteStop['type'];
  targetId: string;
  lat: number;
  lng: number;
  passengersPickedUp: number;
  passengersDroppedOff: number;
  isFrozen: boolean;
}

export interface FrozenValidationResult {
  valid: boolean;
  violationsCount: number;
  errors: string[];
}
