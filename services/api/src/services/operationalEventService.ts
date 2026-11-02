import crypto from 'node:crypto';
import {
  type OperationalEvent,
  type OperationalEventType,
  type EventEntityType,
  type EventActorType,
  type EventProcessingStatus,
  type AffectedScopeResult,
  validateOperationalEvent,
} from '@floodrelay/shared';
import { PostgisRepository, type ListOperationalEventsFilter } from '../db/repository.js';
import { dbToOperationalEvent } from '../db/schema.js';
import { AffectedScopeService } from './affectedScopeService.js';

export interface CreateOperationalEventInput {
  id?: string;
  type: OperationalEventType;
  entityType: EventEntityType;
  entityId: string;
  actorId?: string | null;
  actorType: EventActorType;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  entityVersion?: number;
  occurredAt?: string;
}

export interface RecordEventResult {
  event: OperationalEvent;
  idempotent: boolean;
}

export class OperationalEventService {
  private readonly affectedScopeService: AffectedScopeService;

  constructor(
    private readonly repo: PostgisRepository,
    affectedScopeService?: AffectedScopeService,
  ) {
    this.affectedScopeService = affectedScopeService ?? new AffectedScopeService(repo);
  }

  /**
   * Records an operational event transactionally, guaranteeing idempotency and schema validation.
   */
  async recordEvent(
    input: CreateOperationalEventInput,
    txRepo?: PostgisRepository,
  ): Promise<RecordEventResult> {
    const repository = txRepo ?? this.repo;

    // 1. Idempotency Check
    if (input.idempotencyKey) {
      const existing = await repository.getOperationalEventByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return {
          event: dbToOperationalEvent(existing),
          idempotent: true,
        };
      }
    }

    // 2. Build Event Object
    const id = input.id ?? `evt-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    const event: OperationalEvent = {
      id,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      actorType: input.actorType,
      occurredAt: input.occurredAt ?? nowIso,
      recordedAt: nowIso,
      correlationId: input.correlationId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      entityVersion: input.entityVersion ?? 1,
      processingStatus: 'RECORDED',
      processingAttempts: 0,
      payload: input.payload ?? {},
    };

    // 3. Validation
    const validation = validateOperationalEvent(event);
    if (!validation.valid) {
      const err = new Error(`Operational event validation failed: ${validation.errors.join('; ')}`);
      (err as unknown as { code: string; statusCode: number }).code = 'VALIDATION_ERROR';
      (err as unknown as { code: string; statusCode: number }).statusCode = 400;
      throw err;
    }

    // 4. Persistence
    try {
      const dbRow = await repository.insertOperationalEvent(event);
      return {
        event: dbToOperationalEvent(dbRow),
        idempotent: false,
      };
    } catch (insertErr: unknown) {
      const errCode = (insertErr as { code?: string })?.code;
      const isUniqueViolation =
        errCode === '23505' || (insertErr as Error)?.message?.includes('idempotency_key');

      if (input.idempotencyKey && isUniqueViolation) {
        const raced = await repository.getOperationalEventByIdempotencyKey(input.idempotencyKey);
        if (raced) {
          return {
            event: dbToOperationalEvent(raced),
            idempotent: true,
          };
        }
      }
      throw insertErr;
    }
  }

  /**
   * Retrieves an operational event by its ID.
   */
  async getEvent(id: string): Promise<OperationalEvent | null> {
    const row = await this.repo.getOperationalEvent(id);
    return row ? dbToOperationalEvent(row) : null;
  }

  /**
   * Lists operational events matching query filters.
   */
  async listEvents(filter?: ListOperationalEventsFilter): Promise<OperationalEvent[]> {
    const rows = await this.repo.listOperationalEvents(filter);
    return rows.map(dbToOperationalEvent);
  }

  /**
   * Evaluates the planning scope affected by an operational event and advances its lifecycle.
   */
  async processEvent(id: string): Promise<{
    event: OperationalEvent;
    affectedScope: AffectedScopeResult;
  }> {
    const row = await this.repo.getOperationalEvent(id);
    if (!row) {
      const err = new Error(`Operational event with id "${id}" not found`);
      (err as unknown as { code: string; statusCode: number }).code = 'NOT_FOUND';
      (err as unknown as { code: string; statusCode: number }).statusCode = 404;
      throw err;
    }

    const event = dbToOperationalEvent(row);
    try {
      const scope = await this.affectedScopeService.computeAffectedScope(event);
      const nextStatus: EventProcessingStatus = scope.repairEligible
        ? 'AWAITING_REPAIR'
        : 'SCOPE_IDENTIFIED';

      await this.repo.updateOperationalEventStatus(id, nextStatus, {
        attempts: (row.processing_attempts ?? 0) + 1,
        processedAt: new Date(),
      });

      const updated = await this.repo.getOperationalEvent(id);
      return {
        event: updated ? dbToOperationalEvent(updated) : { ...event, processingStatus: nextStatus },
        affectedScope: scope,
      };
    } catch (processingErr) {
      const errorCode = (processingErr as { code?: string })?.code || 'PROCESSING_FAILED';
      await this.repo.updateOperationalEventStatus(id, 'FAILED', {
        attempts: (row.processing_attempts ?? 0) + 1,
        lastErrorCode: errorCode,
      });
      throw processingErr;
    }
  }

  /**
   * Retries event processing after a failure or for reprocessing.
   */
  async retryEvent(id: string): Promise<{
    event: OperationalEvent;
    affectedScope: AffectedScopeResult;
  }> {
    const row = await this.repo.getOperationalEvent(id);
    if (!row) {
      const err = new Error(`Operational event with id "${id}" not found`);
      (err as unknown as { code: string; statusCode: number }).code = 'NOT_FOUND';
      (err as unknown as { code: string; statusCode: number }).statusCode = 404;
      throw err;
    }

    await this.repo.updateOperationalEventStatus(id, 'RECORDED', {
      lastErrorCode: null,
    });

    return this.processEvent(id);
  }
}
