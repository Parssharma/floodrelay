import { createApp } from './app.js';
import { getPool } from './db/connection.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`FloodRelay API server listening on http://localhost:${port}`);
});

const shutdown = async () => {
  console.log('Shutting down API server...');
  server.close(async () => {
    try {
      const pool = getPool();
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
