import { Router, type Request, type Response, type NextFunction } from 'express';
import type { PostgisRepository } from '../db/repository.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { ListAuditEventsFilterSchema } from '../validation/operationsSchema.js';

export function createAuditRouter(repo: PostgisRepository): Router {
  const router = Router();

  // GET /audit/events - Query paginated audit log (RBAC: VIEW_AUDIT)
  router.get(
    '/events',
    requirePermission('VIEW_AUDIT'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const parsed = ListAuditEventsFilterSchema.safeParse(req.query);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid query filters for audit events',
              details: parsed.error.format(),
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const events = await repo.listAuditEvents(parsed.data);
        const callerRole = req.operator?.role;

        // If caller has role OPERATOR (limited audit privilege), redact sensitive metadata fields
        const sanitized = events.map((evt) => {
          if (callerRole === 'OPERATOR') {
            const redactedPayload = { ...evt.payload };
            delete redactedPayload.clientIp;
            delete redactedPayload.idempotencyRequestHash;
            delete redactedPayload.idempotencyKey;
            return {
              ...evt,
              payload: redactedPayload,
            };
          }
          return evt;
        });

        res.status(200).json({
          success: true,
          count: sanitized.length,
          data: sanitized,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
