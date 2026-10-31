import { ApiClientError } from './errors';
import type {
  ApiResponse,
  CreateRequestInput,
  RescueRequest,
  ListRequestsFilter,
  NearbyRequestsFilter,
  AssignmentRecord,
  ProposeAssignmentInput,
  CommitAssignmentInput,
  ModifyStopInput,
  RouteStop,
} from './types';

export interface ApiClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
}

export class FloodRelayApiClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = (
      config.baseUrl ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.defaultHeaders,
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
      });
    } catch (err) {
      throw new ApiClientError({
        message: `Failed to connect to FloodRelay API at ${url}: ${(err as Error).message}`,
        statusCode: 0,
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorObj = (
        payload as { error?: { message?: string; code?: string; details?: unknown } }
      )?.error;
      const message = errorObj?.message || `API request failed with HTTP ${response.status}`;
      const code = errorObj?.code || `HTTP_${response.status}`;
      const details = errorObj?.details;

      throw new ApiClientError({
        message,
        statusCode: response.status,
        code,
        details,
      });
    }

    return payload as ApiResponse<T>;
  }

  // Health
  async getHealth(
    signal?: AbortSignal,
  ): Promise<{ status: string; timestamp: string; database?: string; version?: string }> {
    const res = await this.request<{
      status: string;
      timestamp: string;
      database?: string;
      version?: string;
    }>('/health', {
      method: 'GET',
      signal,
    });
    return res.data;
  }

  // Citizen & Operator Request Endpoints
  async createRequest(input: CreateRequestInput, signal?: AbortSignal): Promise<RescueRequest> {
    const headers: Record<string, string> = {};
    if (input.idempotencyKey) {
      headers['Idempotency-Key'] = input.idempotencyKey;
    }

    const res = await this.request<RescueRequest>('/requests', {
      method: 'POST',
      body: JSON.stringify(input),
      headers,
      signal,
    });
    return res.data;
  }

  async getRequest(id: string, signal?: AbortSignal): Promise<RescueRequest> {
    const res = await this.request<RescueRequest>(`/requests/${encodeURIComponent(id)}`, {
      method: 'GET',
      signal,
    });
    return res.data;
  }

  async listRequests(filter?: ListRequestsFilter, signal?: AbortSignal): Promise<RescueRequest[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.urgency) params.set('urgency', filter.urgency);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<RescueRequest[]>(`/requests${qs}`, {
      method: 'GET',
      signal,
    });
    return res.data;
  }

  async listNearbyRequests(
    filter: NearbyRequestsFilter,
    signal?: AbortSignal,
  ): Promise<RescueRequest[]> {
    const params = new URLSearchParams({
      lat: String(filter.lat),
      lng: String(filter.lng),
    });
    if (filter.radiusKm) params.set('radiusKm', String(filter.radiusKm));
    if (filter.status) params.set('status', filter.status);
    if (filter.limit) params.set('limit', String(filter.limit));

    const res = await this.request<RescueRequest[]>(`/requests/nearby?${params.toString()}`, {
      method: 'GET',
      signal,
    });
    return res.data;
  }

  // Operator Assignment Endpoints
  async listAssignments(
    filter?: {
      status?: 'PROPOSED' | 'COMMITTED';
      scenarioId?: string;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ): Promise<AssignmentRecord[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.scenarioId) params.set('scenarioId', filter.scenarioId);
    if (filter?.limit) params.set('limit', String(filter.limit));
    if (filter?.offset) params.set('offset', String(filter.offset));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<AssignmentRecord[]>(`/assignments${qs}`, {
      method: 'GET',
      signal,
    });
    return res.data;
  }

  async getAssignment(id: string, signal?: AbortSignal): Promise<AssignmentRecord> {
    const res = await this.request<AssignmentRecord>(`/assignments/${encodeURIComponent(id)}`, {
      method: 'GET',
      signal,
    });
    return res.data;
  }

  async proposeAssignment(
    input: ProposeAssignmentInput,
    signal?: AbortSignal,
  ): Promise<AssignmentRecord> {
    const res = await this.request<AssignmentRecord>('/assignments/propose', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
    return res.data;
  }

  async commitAssignment(
    id: string,
    input: CommitAssignmentInput,
    signal?: AbortSignal,
  ): Promise<AssignmentRecord> {
    const res = await this.request<AssignmentRecord>(
      `/assignments/${encodeURIComponent(id)}/commit`,
      {
        method: 'POST',
        body: JSON.stringify(input),
        signal,
      },
    );
    return res.data;
  }

  async modifyStop(
    assignmentId: string,
    stopId: string,
    input: ModifyStopInput,
    operatorId = 'OPERATOR',
    signal?: AbortSignal,
  ): Promise<RouteStop> {
    const res = await this.request<RouteStop>(
      `/assignments/${encodeURIComponent(assignmentId)}/stops/${encodeURIComponent(stopId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
        headers: {
          'x-operator-id': operatorId,
        },
        signal,
      },
    );
    return res.data;
  }
}

export const apiClient = new FloodRelayApiClient();
