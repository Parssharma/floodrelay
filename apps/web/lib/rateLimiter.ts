// In-memory sliding window rate limiter
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export function resetRateLimiter(): void {
  rateLimitMap.clear();
}

export function checkRateLimit(
  clientIp: string,
  maxRequests = RATE_LIMIT_MAX_REQUESTS,
  windowMs = RATE_LIMIT_WINDOW_MS,
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(clientIp);

  if (!record || now >= record.resetAt) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (record.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  record.count += 1;
  return { allowed: true };
}
