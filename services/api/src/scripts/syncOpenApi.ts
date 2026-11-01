import fs from 'node:fs';
import path from 'node:path';

const apiSpecPath = path.resolve('src/openapi.json');
const docsSpecPath = path.resolve('../../docs/openapi.json');

const spec = JSON.parse(fs.readFileSync(apiSpecPath, 'utf-8'));

// 1. Add security schemes
spec.components = spec.components || {};
spec.components.securitySchemes = {
  BearerAuth: {
    type: 'http',
    scheme: 'bearer',
    description: 'Operator cryptographic session token issued by POST /auth/login',
  },
  CookieAuth: {
    type: 'apiKey',
    in: 'cookie',
    name: 'floodrelay_session',
    description: 'HTTP-only session cookie set by POST /auth/login',
  },
};

// 2. Add schemas
spec.components.schemas = spec.components.schemas || {};

spec.components.schemas.OperatorProfile = {
  type: 'object',
  required: ['id', 'username', 'name', 'role'],
  properties: {
    id: { type: 'string', example: 'op-8a7f9b1c' },
    username: { type: 'string', example: 'eoc_operator' },
    name: { type: 'string', example: 'Capt. R. Vance' },
    role: { type: 'string', enum: ['OPERATOR', 'ADMIN', 'DISPATCHER'], example: 'OPERATOR' },
  },
};

spec.components.schemas.LoginInput = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', example: 'eoc_operator' },
    password: { type: 'string', format: 'password', example: 'YourSecurePassword123!' },
  },
};

spec.components.schemas.LoginResponse = {
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      required: ['token', 'operator', 'expiresAt'],
      properties: {
        token: { type: 'string', example: '8f4c2e687a19c5b290df62e8412bc481' },
        operator: { $ref: '#/components/schemas/OperatorProfile' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

spec.components.schemas.LogoutResponse = {
  type: 'object',
  required: ['success', 'message', 'timestamp'],
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'Logged out successfully' },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

spec.components.schemas.MeResponse = {
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      required: ['operator'],
      properties: {
        operator: { $ref: '#/components/schemas/OperatorProfile' },
      },
    },
  },
};

// 3. Add paths
spec.paths = spec.paths || {};

spec.paths['/auth/login'] = {
  post: {
    summary: 'Authenticate operator',
    description:
      'Verifies operator credentials, enforces rate limiting, and issues a cryptographic session token and HTTP-only cookie.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/LoginInput' },
        },
      },
    },
    responses: {
      '200': {
        description: 'Login successful',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginResponse' },
          },
        },
      },
      '400': {
        description: 'Validation failure',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '401': {
        description: 'Invalid credentials',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '429': {
        description: 'Rate limit exceeded',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/auth/logout'] = {
  post: {
    summary: 'Log out operator',
    description: 'Revokes active operator session and clears the session cookie.',
    responses: {
      '200': {
        description: 'Logged out successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LogoutResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/auth/me'] = {
  get: {
    summary: 'Get current operator session profile',
    description: 'Returns profile of currently authenticated operator.',
    security: [{ BearerAuth: [] }, { CookieAuth: [] }],
    responses: {
      '200': {
        description: 'Active operator session profile',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/MeResponse' },
          },
        },
      },
      '401': {
        description: 'Unauthorized or session expired',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// 4. Annotate protected routes with security & 401 response
const protectedRoutes: Array<{ path: string; method: string }> = [
  { path: '/requests', method: 'get' },
  { path: '/requests/{id}', method: 'get' },
  { path: '/assignments', method: 'get' },
  { path: '/assignments/propose', method: 'post' },
  { path: '/assignments/{id}', method: 'get' },
  { path: '/assignments/{id}/commit', method: 'post' },
  { path: '/assignments/{id}/stops/{stopId}', method: 'patch' },
];

for (const pr of protectedRoutes) {
  if (spec.paths[pr.path] && spec.paths[pr.path][pr.method]) {
    spec.paths[pr.path][pr.method].security = [{ BearerAuth: [] }, { CookieAuth: [] }];
    if (!spec.paths[pr.path][pr.method].responses['401']) {
      spec.paths[pr.path][pr.method].responses['401'] = {
        description: 'Operator authentication required or session expired',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      };
    }
  }
}

// Ensure key sorting is stable
const sortedPaths: Record<string, unknown> = {};
for (const p of Object.keys(spec.paths).sort()) {
  sortedPaths[p] = spec.paths[p];
}
spec.paths = sortedPaths;

const formattedJson = JSON.stringify(spec, null, 2) + '\n';

fs.writeFileSync(apiSpecPath, formattedJson, 'utf-8');
fs.writeFileSync(docsSpecPath, formattedJson, 'utf-8');

console.log(
  '✓ Synchronized OpenAPI specification in services/api/src/openapi.json and docs/openapi.json',
);
