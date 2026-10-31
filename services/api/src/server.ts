import { createApp } from './app.js';
import { getPool } from './db/connection.js';
import { PostgisRepository } from './db/repository.js';
import { AuthService } from './services/authService.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const pool = getPool();
const repo = new PostgisRepository(pool);
const authService = new AuthService(repo);

// Ensure initial operator account exists in dev/test
await authService.ensureInitialOperator().catch((err) => {
  console.error('Warning: failed to check initial operator:', err);
});

const app = createApp({ repository: repo, authService });

const server = app.listen(port, () => {
  console.log(`FloodRelay API server listening on http://localhost:${port}`);
});

const shutdown = async () => {
  console.log('Shutting down API server...');
  server.close(async () => {
    try {
      await pool.end();
      console.log('Database pool closed');
    } catch {
      // ignore
    }
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
