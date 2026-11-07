import http from 'k6/http';
import { createAuthManager } from './authManager.js';

// Global VU token cache to avoid hammering login endpoint needlessly on every iteration
const tokenCache = new Map();

const defaultAuthHandler = (url, payload, opts) => http.post(url, payload, opts);
const k6AuthManager = createAuthManager(defaultAuthHandler, tokenCache);

/**
 * Authenticates as an operator in k6 VU context.
 * Credentials must be explicitly supplied (no hardcoded defaults permitted).
 *
 * @param {string} baseUrl
 * @param {string} username
 * @param {string} password
 * @returns {{ headers: Record<string, string>, token: string }}
 */
export function getAuthHeaders(baseUrl, username, password) {
  return k6AuthManager(baseUrl, username, password);
}
