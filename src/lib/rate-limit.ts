import { Context } from 'hono';
import Redis from 'ioredis';
import type { AuthContext } from '../types/index.js';

// ============================================================================
// Redis Client
// ============================================================================

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required for BullMQ compatibility
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('Redis client error:', err);
});

// ============================================================================
// Rate Limit Configuration
// ============================================================================

const RATE_LIMITS = {
  free: parseInt(process.env.RATE_LIMIT_FREE || '100', 10),
  pro: parseInt(process.env.RATE_LIMIT_PRO || '1000', 10),
  enterprise: parseInt(process.env.RATE_LIMIT_ENTERPRISE || '10000', 10),
};

const WINDOW_SIZE_SECONDS = 3600; // 1 hour

// ============================================================================
// Rate Limiting Functions
// ============================================================================

/**
 * Check if request should be rate limited
 * @param projectId - Project ID
 * @param tier - Project tier
 * @returns Object with allowed status and remaining requests
 */
export async function checkRateLimit(
  projectId: string,
  tier: 'free' | 'pro' | 'enterprise'
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}> {
  const limit = RATE_LIMITS[tier];
  const key = `ratelimit:${projectId}:${getCurrentWindow()}`;

  try {
    // Increment counter
    const count = await redis.incr(key);

    // Set expiry on first request in window
    if (count === 1) {
      await redis.expire(key, WINDOW_SIZE_SECONDS);
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const resetAt = new Date(Date.now() + WINDOW_SIZE_SECONDS * 1000);

    return {
      allowed,
      remaining,
      limit,
      resetAt,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open - allow request if Redis is down
    return {
      allowed: true,
      remaining: limit,
      limit,
      resetAt: new Date(Date.now() + WINDOW_SIZE_SECONDS * 1000),
    };
  }
}

/**
 * Get current time window (hour-based)
 * @returns Window identifier (e.g., '2024-01-15-14')
 */
function getCurrentWindow(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}-${hour}`;
}

/**
 * Hono middleware for rate limiting
 */
export async function rateLimitMiddleware(c: Context, next: () => Promise<void>) {
  const auth = c.get('auth') as AuthContext | undefined;

  if (!auth) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
      401
    );
  }

  const { allowed, remaining, limit, resetAt } = await checkRateLimit(
    auth.project_id,
    auth.tier
  );

  // Set rate limit headers
  c.header('X-RateLimit-Limit', limit.toString());
  c.header('X-RateLimit-Remaining', remaining.toString());
  c.header('X-RateLimit-Reset', resetAt.toISOString());

  if (!allowed) {
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Limit: ${limit} requests per hour. Resets at ${resetAt.toISOString()}`,
        },
      },
      429
    );
  }

  await next();
}

// ============================================================================
// Cleanup
// ============================================================================

export async function closeRedis(): Promise<void> {
  await redis.quit();
  console.log('Redis connection closed');
}

process.on('SIGTERM', closeRedis);
process.on('SIGINT', closeRedis);

export { redis };
