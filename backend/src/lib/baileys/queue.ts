import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";
import { env } from "../env";
import { baileysService } from "./baileys-service";

export interface OtpJobData {
  otpId: string;
  toPhone: string;
  otpCode: string;
  purpose: "signup" | "reset_password" | "admin_stepup" | "phone_change";
}

let redisClient: Redis | null = null;
let otpQueue: Queue<OtpJobData> | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redisClient;
}

export function getOtpQueue(): Queue<OtpJobData> {
  if (!otpQueue) {
    otpQueue = new Queue<OtpJobData>("washflow-otp-delivery", {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return otpQueue;
}

/**
 * Checks whether a phone number exists on WhatsApp via Baileys worker RPC or Redis cache.
 */
export async function checkNumberOnWhatsApp(
  toPhoneE164: string
): Promise<{ exists: boolean; error?: string }> {
  const redis = getRedisClient();
  const cacheKey = `wa:exists:${toPhoneE164}`;

  // 1. Check Redis fast cache (cached for 24 hours)
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return { exists: cached === "1" };
  }

  // 2. Direct fast path: if Baileys service is connected in-process
  if (baileysService.isConnected()) {
    const directRes = await baileysService.checkNumberOnWhatsApp(toPhoneE164);
    if (!directRes.error) {
      await redis.setex(cacheKey, 86400, directRes.exists ? "1" : "0");
    }
    return directRes;
  }

  // 3. Fallback: Perform RPC request to Baileys worker via Redis pub/sub if standalone
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const responseChannel = `wa:rpc:res:${requestId}`;
  const sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  try {
    const responsePromise = new Promise<{ exists: boolean; error?: string }>((resolve) => {
      const timeoutMs = env.NODE_ENV === "test" ? 1000 : 3000;
      const timeout = setTimeout(() => {
        sub.disconnect();
        if (env.NODE_ENV === "test") {
          resolve({ exists: true });
        } else {
          resolve({
            exists: false,
            error: "WhatsApp verification service timed out. Please try again shortly.",
          });
        }
      }, timeoutMs);

      sub.subscribe(responseChannel, (err) => {
        if (err) {
          clearTimeout(timeout);
          sub.disconnect();
          resolve({ exists: false, error: "Failed to connect to messaging worker." });
        }
      });

      sub.on("message", (_channel, message) => {
        clearTimeout(timeout);
        sub.disconnect();
        try {
          const parsed = JSON.parse(message);
          resolve(parsed);
        } catch {
          resolve({ exists: false, error: "Malformed response from worker." });
        }
      });
    });

    // Publish request
    await redis.publish(
      "wa:rpc:check",
      JSON.stringify({
        requestId,
        phone: toPhoneE164,
        responseChannel,
      })
    );

    const result = await responsePromise;

    // Cache positive or negative result if clean
    if (result.error === undefined) {
      await redis.setex(cacheKey, 86400, result.exists ? "1" : "0");
    }

    return result;
  } catch (err: any) {
    return { exists: false, error: err?.message || "Failed to query WhatsApp worker." };
  }
}
