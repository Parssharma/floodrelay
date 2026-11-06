import http from 'k6/http';
import { check } from 'k6';

// Global VU token cache to avoid hammering login endpoint needlessly on every iteration
const tokenCache = new Map();

/**
 * Authenticates as an operator and returns headers with Bearer token and session cookie.
 *
 * @param {string} baseUrl
 * @param {string} username
 * @param {string} password
 * @returns {{ headers: Record<string, string>, token: string }}
 */
export function getAuthHeaders(baseUrl, username = 'eoc_operator', password = 'RescueOps@2026!') {
  const cacheKey = `${baseUrl}_${username}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 60000) {
    return {
      token: cached.token,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cached.token}`,
        Cookie: `floodrelay_session=${cached.token}`,
      },
    };
  }

  const payload = JSON.stringify({ username, password });
  const res = http.post(`${baseUrl}/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /auth/login' },
  });

  const ok = check(res, {
    'auth login succeeded (200)': (r) => r.status === 200,
    'auth returns session token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.data && typeof body.data.token === 'string';
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok) {
    return {
      token: '',
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const data = JSON.parse(res.body).data;
  const token = data.token;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 3600000;

  tokenCache.set(cacheKey, { token, expiresAt });

  return {
    token,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Cookie: `floodrelay_session=${token}`,
    },
  };
}
