/**
 * Pure operator authentication manager logic.
 * Decoupled from k6 runtime to enable automated unit testing.
 *
 * @param {(url: string, payload: string, options: any) => any} httpPost
 * @param {Map<string, { token: string, expiresAt: number }>} [cacheInstance]
 */
export function createAuthManager(httpPost, cacheInstance = new Map()) {
  return function getAuth(baseUrl, username, password) {
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      throw new Error(
        '[Auth Error] Operator credentials missing. Set LOAD_TEST_USERNAME and LOAD_TEST_PASSWORD (or OPERATOR_USERNAME and OPERATOR_PASSWORD) environment variables.',
      );
    }

    const cacheKey = `${baseUrl}_${username}`;
    const cached = cacheInstance.get(cacheKey);

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
    const res = httpPost(`${baseUrl}/auth/login`, payload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /auth/login' },
    });

    let token = null;
    let expiresAt = Date.now() + 3600000;

    if (res && res.status === 200 && res.body) {
      try {
        const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
        if (body && body.data && typeof body.data.token === 'string') {
          token = body.data.token;
          if (body.data.expiresAt) {
            expiresAt = new Date(body.data.expiresAt).getTime();
          }
        }
      } catch (_) {
        // ignore parse error
      }
    }

    if (!token) {
      // Intentionally do NOT print password or tokens in error messages
      throw new Error(
        `[Auth Error] Failed to authenticate operator "${username}" at ${baseUrl}/auth/login (HTTP ${res?.status ?? 'unknown'}). Verify credentials.`,
      );
    }

    cacheInstance.set(cacheKey, { token, expiresAt });

    return {
      token,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Cookie: `floodrelay_session=${token}`,
      },
    };
  };
}
