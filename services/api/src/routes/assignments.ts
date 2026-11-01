import { Router, type Request, type Response, type NextFunction } from 'express';
import { AssignmentService } from '../services/assignmentService.js';
import {
  CommitAssignmentSchema,
  ListAssignmentsFilterSchema,
  ModifyStopSchema,
  ProposeAssignmentSchema,
} from '../validation/assignmentSchema.js';

export function createAssignmentsRouter(assignmentService: AssignmentService): Router {
  const router = Router();

  // POST /assignments/propose - Run solver on stored data and propose assignments
  router.post(
    '/propose',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const parsed = ProposeAssignmentSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid proposal options',
              details: parsed.error.format(),
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        try {
          const plan = await assignmentService.proposeAssignment(parsed.data);
          res.status(201).json({
            success: true,
            data: plan,
          });
        } catch (domainErr: unknown) {
          const code = (domainErr as { code?: string }).code;
          const statusCode = (domainErr as { statusCode?: number }).statusCode;
          if (code && statusCode) {
            res.status(statusCode).json({
              error: {
                code,
                message: (domainErr as Error).message,
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }
          throw domainErr;
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /assignments - List assignments
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ListAssignmentsFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query filters',
            details: parsed.error.format(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const list = await assignmentService.listAssignments(parsed.data);
      res.status(200).json({
        success: true,
        count: list.length,
        data: list,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /assignments/:id - Retrieve assignment plan with routes and unserved requests
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Assignment ID parameter is required',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const assignment = await assignmentService.getAssignment(id);
      if (!assignment) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Assignment with id "${id}" not found`,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /assignments/:id/commit - Operator commits an assignment plan (freezes stops)
  router.post(
    '/:id/commit',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Assignment ID parameter is required',
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const parsed = CommitAssignmentSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid commit payload',
              details: parsed.error.format(),
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        // Authoritative operator identity from authenticated session
        const sessionOperator = req.operator;
        const authoritativeOperatorId = sessionOperator?.username || sessionOperator?.id;

        // Prevent operator impersonation: If client explicitly provides an operatorId that does not match authenticated session
        if (
          parsed.data.operatorId &&
          sessionOperator &&
          parsed.data.operatorId !== sessionOperator.username &&
          parsed.data.operatorId !== sessionOperator.id
        ) {
          res.status(403).json({
            error: {
              code: 'IMPERSONATION_FORBIDDEN',
              message: `Cannot commit assignment on behalf of "${parsed.data.operatorId}". Authenticated as "${sessionOperator.username}".`,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const effectiveOperatorId = authoritativeOperatorId || parsed.data.operatorId || 'OPERATOR';

        try {
          const committed = await assignmentService.commitAssignment(id, {
            operatorId: effectiveOperatorId,
            notes: parsed.data.notes,
          });
          if (!committed) {
            res.status(409).json({
              error: {
                code: 'COMMIT_FAILED',
                message: `Failed to commit assignment "${id}"`,
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }

          const updated = await assignmentService.getAssignment(id);

          res.status(200).json({
            success: true,
            message: 'Assignment plan committed successfully. Stops are now frozen.',
            data: updated,
          });
        } catch (domainErr: unknown) {
          const code = (domainErr as { code?: string }).code || 'COMMIT_FAILED';
          const statusCode =
            (domainErr as { statusCode?: number }).statusCode || (code === 'NOT_FOUND' ? 404 : 409);
          res.status(statusCode).json({
            error: {
              code,
              message: (domainErr as Error).message,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /assignments/:id/stops/:stopId - Operator modifies a stop on a PROPOSED assignment
  router.patch(
    '/:id/stops/:stopId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawId = req.params.id;
        const rawStopId = req.params.stopId;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        const stopId = Array.isArray(rawStopId) ? rawStopId[0] : rawStopId;

        if (!id || !stopId) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Assignment ID and Stop ID parameters are required',
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const parsed = ModifyStopSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid stop modification payload',
              details: parsed.error.format(),
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const sessionOperator = req.operator;
        const authoritativeOperatorId = sessionOperator?.username || sessionOperator?.id;
        const headerOperatorId = req.headers['x-operator-id'] as string | undefined;

        if (
          headerOperatorId &&
          sessionOperator &&
          headerOperatorId !== sessionOperator.username &&
          headerOperatorId !== sessionOperator.id
        ) {
          res.status(403).json({
            error: {
              code: 'IMPERSONATION_FORBIDDEN',
              message: `Cannot modify stop on behalf of "${headerOperatorId}". Authenticated as "${sessionOperator.username}".`,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const operatorId = authoritativeOperatorId || headerOperatorId || 'OPERATOR';

        try {
          const updatedStop = await assignmentService.modifyStop(
            id,
            stopId,
            parsed.data,
            operatorId,
          );
          res.status(200).json({
            success: true,
            data: updatedStop,
          });
        } catch (domainErr: unknown) {
          const code = (domainErr as { code?: string }).code;
          if (code === 'NOT_FOUND') {
            res.status(404).json({
              error: {
                code: 'NOT_FOUND',
                message: (domainErr as Error).message,
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }
          if (code === 'CANNOT_MODIFY_COMMITTED') {
            res.status(409).json({
              error: {
                code: 'CANNOT_MODIFY_COMMITTED',
                message: (domainErr as Error).message,
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }
          throw domainErr;
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
