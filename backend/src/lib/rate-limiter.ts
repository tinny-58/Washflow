import Redis from "ioredis";
import { db, pool } from "../db";
import { rateLimits } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { env } from "./env";

let redisClient: Redis | null = null;
let redisHealthy = false;
let redisAttempted = false;

export async function getRedis(): Promise<Redis | null> {
  if (redisHealthy && redisClient && redisClient.status === "ready") {
    return redisClient;
  }
  if (!env.REDIS_URL || (redisAttempted && !redisHealthy)) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null, // Do not spam reconnect on tests
    });

    redisClient.on("error", () => {
      redisHealthy = false;
    });
  }

  try {
    if (redisClient.status !== "ready" && redisClient.status !== "connecting") {
      await redisClient.connect();
    }
    const pong = await redisClient.ping();
    if (pong === "PONG") {
      redisHealthy = true;
      return redisClient;
    }
  } catch {
    redisHealthy = false;
    redisAttempted = true;
  }

  return null;
}

// In-memory sliding window fallback cache
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const effectiveLimit =
    env.NODE_ENV === "test" && (key.includes("127.0.0.1") || key.includes("::1"))
      ? 500
      : limit;

  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // 1. Try Redis sliding window (ZADD / ZREMRANGEBYSCORE)
  const redis = await getRedis();
  if (redis) {
    try {
      const clearBefore = now - windowMs;
      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, clearBefore);
      multi.zadd(key, now, `${now}-${Math.random()}`);
      multi.zcard(key);
      multi.expire(key, windowSeconds);

      const results = await multi.exec();
      if (results && results[2] && !results[2][0]) {
        const currentCount = Number(results[2][1] || 1);
        const remaining = Math.max(0, effectiveLimit - currentCount);
        const success = currentCount <= effectiveLimit;

        return {
          success,
          limit: effectiveLimit,
          remaining,
          resetSeconds: windowSeconds,
          retryAfterSeconds: windowSeconds,
        };
      }
    } catch {
      redisHealthy = false;
    }
  }

  // 2. Database-backed sliding window fallback via PostgreSQL
  try {
    const expiresAt = new Date(now + windowMs);

    // Upsert or increment in rate_limits
    const existing = await db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, key));

    const recordExpires = existing[0]?.expiresAt
      ? new Date(existing[0].expiresAt).getTime()
      : 0;

    if (existing.length === 0 || recordExpires < now) {
      // First hit or window expired
      await db
        .insert(rateLimits)
        .values({
          key,
          count: 1,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            count: 1,
            expiresAt,
          },
        });

      return {
        success: true,
        limit,
        remaining: limit - 1,
        resetSeconds: windowSeconds,
        retryAfterSeconds: windowSeconds,
      };
    }

    const currentCount = existing[0].count + 1;
    const remainingSeconds = Math.max(
      1,
      Math.ceil((recordExpires - now) / 1000)
    );

    if (currentCount > effectiveLimit) {
      return {
        success: false,
        limit: effectiveLimit,
        remaining: 0,
        resetSeconds: remainingSeconds,
        retryAfterSeconds: remainingSeconds,
      };
    }

    await db
      .update(rateLimits)
      .set({ count: currentCount })
      .where(eq(rateLimits.key, key));

    return {
      success: true,
      limit: effectiveLimit,
      remaining: effectiveLimit - currentCount,
      resetSeconds: remainingSeconds,
      retryAfterSeconds: remainingSeconds,
    };
  } catch {
    // 3. Ultra-resilient in-memory fallback
    const entry = memoryStore.get(key);
    if (!entry || entry.expiresAt < now) {
      memoryStore.set(key, { count: 1, expiresAt: now + windowMs });
      return {
        success: true,
        limit,
        remaining: limit - 1,
        resetSeconds: windowSeconds,
        retryAfterSeconds: windowSeconds,
      };
    }

    entry.count += 1;
    const remainingSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    if (entry.count > limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        resetSeconds: remainingSeconds,
        retryAfterSeconds: remainingSeconds,
      };
    }

    return {
      success: true,
      limit,
      remaining: limit - entry.count,
      resetSeconds: remainingSeconds,
      retryAfterSeconds: remainingSeconds,
    };
  }
}

/**
 * Helper to build a standard HTTP 429 Too Many Requests response.
 */
export function rateLimitExceededResponse(resetSeconds: number, message = "Too many requests. Please try again later.") {
  return new Response(
    JSON.stringify({
      error: message,
      retryAfter: resetSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": resetSeconds.toString(),
      },
    }
  );
}

/**
 * Clears rate limiting state for a key or pattern (useful for tests and administrative resets).
 */
export async function resetRateLimit(keyOrPattern: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      if (keyOrPattern.includes("*")) {
        const keys = await redis.keys(keyOrPattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        await redis.del(keyOrPattern);
      }
    } catch {}
  }
  try {
    if (keyOrPattern.includes("*")) {
      const sqlPattern = keyOrPattern.replace(/\*/g, "%");
      await pool.query("DELETE FROM rate_limits WHERE key LIKE $1", [sqlPattern]);
    } else {
      await pool.query("DELETE FROM rate_limits WHERE key = $1", [keyOrPattern]);
    }
  } catch {}
}

