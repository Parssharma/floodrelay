import type {
  RescueRequest,
  UrgencyLevel,
  RequestStatus,
  VerificationStatus,
  RescueResource,
  Shelter,
  RouteStop,
  ResourceRoute,
  UnservedRequest,
  SolverMetrics,
  ScenarioProvenance,
} from '@floodrelay/shared';

export type {
  RescueRequest,
  UrgencyLevel,
  RequestStatus,
  VerificationStatus,
  RescueResource,
  Shelter,
  RouteStop,
  ResourceRoute,
  UnservedRequest,
  SolverMetrics,
  ScenarioProvenance,
};

export interface CreateRequestInput {
  lat: number;
  lng: number;
  peopleCount: number;
  urgency: UrgencyLevel;
  medicalNeeds?: boolean;
  notes?: string;
  source?: 'SIMULATED' | 'REPORTED';
  idempotencyKey?: string;
}

export interface ListRequestsFilter {
  status?: RequestStatus;
  urgency?: UrgencyLevel;
  limit?: number;
  offset?: number;
}

export interface NearbyRequestsFilter {
  lat: number;
  lng: number;
  radiusKm?: number;
  status?: RequestStatus;
  limit?: number;
}

export interface AssignmentRecord {
  id: string;
  title?: string;
  description?: string;
  scenarioId?: string | null;
  scenario_id?: string | null;
  status: 'PROPOSED' | 'COMMITTED';
  metrics?: SolverMetrics | null;
  unserved?: UnservedRequest[] | null;
  routes?: ResourceRoute[];
  stops?: RouteStop[];
  assetsAssigned?: string[];
  committedAt?: string | null;
  committed_at?: string | null;
  committedBy?: string | null;
  committed_by?: string | null;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
}

export interface ProposeAssignmentInput {
  scenarioId?: string;
  algorithm?: 'cluster-allocation' | 'nearest-first' | 'savings';
  includeUnverified?: boolean;
  preserveFrozen?: boolean;
  maxShiftMinutes?: number;
}

export interface CommitAssignmentInput {
  operatorId: string;
  notes?: string;
}

export interface ModifyStopInput {
  isFrozen?: boolean;
  stopNumber?: number;
  resourceId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  idempotent?: boolean;
  count?: number;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp?: string;
  };
}

export interface OperatorProfile {
  id: string;
  username: string;
  name: string;
  role: 'OPERATOR' | 'ADMIN' | 'DISPATCHER';
}

export interface LoginResult {
  token: string;
  operator: OperatorProfile;
  expiresAt: string;
}
