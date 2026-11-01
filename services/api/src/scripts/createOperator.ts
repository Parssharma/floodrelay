import { getPool } from '../db/connection.js';
import { PostgisRepository } from '../db/repository.js';
import { AuthService } from '../services/authService.js';
import type { OperatorRole } from '../db/schema.js';

async function main() {
  const args = process.argv.slice(2);
  const username =
    args[0] || process.env.INITIAL_OPERATOR_USERNAME || process.env.OPERATOR_USERNAME;
  const password =
    args[1] || process.env.INITIAL_OPERATOR_PASSWORD || process.env.OPERATOR_PASSWORD;
  const name =
    args[2] || process.env.INITIAL_OPERATOR_NAME || process.env.OPERATOR_NAME || 'Duty Officer';
  const role = (args[3] ||
    process.env.INITIAL_OPERATOR_ROLE ||
    process.env.OPERATOR_ROLE ||
    'OPERATOR') as OperatorRole;

  if (!username || !password) {
    console.error(
      'Usage: npm --workspace=@floodrelay/api run create-operator <username> <password> [name] [role]',
    );
    console.error(
      'Or set INITIAL_OPERATOR_USERNAME and INITIAL_OPERATOR_PASSWORD environment variables.',
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: Operator password must be at least 8 characters.');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && password === 'RescueOps@2026!') {
    console.error(
      'Error: Default development password "RescueOps@2026!" is strictly prohibited in production.',
    );
    process.exit(1);
  }

  const pool = getPool();
  try {
    const repo = new PostgisRepository(pool);
    const authService = new AuthService(repo);

    const existing = await repo.getOperatorByUsername(username);
    if (existing) {
      console.log(`Operator "${username}" already exists.`);
      console.log(
        'To rotate this operator password, please update the credentials directly in the database.',
      );
      process.exit(0);
    }

    const op = await authService.createOperator({
      username,
      password,
      name,
      role,
    });
    console.log(
      `✓ Operator account provisioned: ID=${op.id}, username="${op.username}", role=${op.role}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed to provision operator:', err);
  process.exit(1);
});
