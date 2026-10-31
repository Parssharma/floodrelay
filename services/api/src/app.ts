import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool } from './db/connection.js';
import { PostgisRepository } from './db/repository.js';
import { RequestService } from './services/requestService.js';
import { AssignmentService } from './services/assignmentService.js';
import { AuthService } from './services/authService.js';
import { createRequestsRouter } from './routes/requests.js';
import { createAssignmentsRouter } from './routes/assignments.js';
import { createAuthRouter } from './routes/auth.js';
import { requireOperatorAuth } from './middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const openapiSpec = JSON.parse(readFileSync(join(__dirname, 'openapi.json'), 'utf-8'));

export interface AppDependencies {
  repository?: PostgisRepository;
  requestService?: RequestService;
  assignmentService?: AssignmentService;
  authService?: AuthService;
}

export function createApp(deps?: AppDependencies): Express {
  const app = express();

  // CORS headers middleware for browser clients
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const origin = _req.header('Origin') || process.env.CORS_ORIGIN || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Idempotency-Key, X-Idempotency-Key, Authorization, Cookie',
    );
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '100kb' }));

  const repo = deps?.repository ?? new PostgisRepository(getPool());
  const authService = deps?.authService ?? new AuthService(repo);
  const requestService = deps?.requestService ?? new RequestService(repo);
  const assignmentService = deps?.assignmentService ?? new AssignmentService(repo);

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // OpenAPI spec endpoint
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.status(200).json(openapiSpec);
  });

  // Mount API routers matching OpenAPI specification paths
  app.use('/auth', createAuthRouter(authService));
  app.use('/requests', createRequestsRouter(requestService, authService));
  app.use(
    '/assignments',
    requireOperatorAuth(authService),
    createAssignmentsRouter(assignmentService),
  );

  // 404 handler for undefined routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Global error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'An unexpected internal server error occurred',
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}
