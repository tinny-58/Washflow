import { createHmac, createHash, randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "../db";
import { users, bookings } from "../db/schema";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { env } from "./env";

const DEVICE_COOKIE_NAME = "wf_did";

/**
 * Extracts and hashes the client's IP address with a salt.
 * Ensures raw IP addresses are never persisted in the database.
 */
export async function getClientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const realIp = headerList.get("x-real-ip");
  const rawIp = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "127.0.0.1";

  return createHash("sha256")
    .update(`${rawIp}:${env.SESSION_SECRET}`)
    .digest("hex");
}

/**
 * Retrieves the raw IP for rate limiting keys.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const realIp = headerList.get("x-real-ip");
  return forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "127.0.0.1";
}

/**
 * Gets or creates a privacy-respecting signed device fingerprint.
 * Combines an httpOnly signed device ID cookie with a hashed User-Agent and IP subnet.
 */
export async function getDeviceFingerprint(): Promise<{
  fingerprint: string;
  isNewCookie: boolean;
  rawDeviceId: string;
}> {
  const cookieStore = await cookies();
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") || "unknown-agent";
  const ipHash = await getClientIpHash();

  let rawDeviceId = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
  let isNew = false;

  if (!rawDeviceId) {
    rawDeviceId = randomUUID();
    isNew = true;
  }

  // Create cryptographic HMAC of (deviceId + userAgent + ipHash)
  const fingerprint = createHmac("sha256", env.DEVICE_FINGERPRINT_SECRET)
    .update(`${rawDeviceId}:${userAgent}:${ipHash}`)
    .digest("hex");

  return {
    fingerprint,
    isNewCookie: isNew,
    rawDeviceId,
  };
}

/**
 * Sets the device ID cookie if newly generated.
 */
export function setDeviceCookie(responseHeaders: Headers, rawDeviceId: string) {
  const isProduction = env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 365 * 2; // 2 years
  const secure = isProduction ? "; Secure" : "";
  responseHeaders.append(
    "Set-Cookie",
    `${DEVICE_COOKIE_NAME}=${rawDeviceId}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
  );
}

/**
 * Abuse Check 1: Enforce max 2 accounts per device fingerprint.
 */
export async function checkDeviceAccountLimit(deviceFingerprint: string): Promise<boolean> {
  const accounts = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.deviceFingerprint, deviceFingerprint));

  const total = Number(accounts[0]?.count || 0);
  return total < env.MAX_ACCOUNTS_PER_DEVICE;
}

/**
 * Abuse Check 2: Enforce max 2 simultaneously open (non-delivered, non-cancelled) bookings
 * per phone or device fingerprint.
 */
export async function checkOpenBookingsLimit(
  customerId: string,
  deviceFingerprint: string
): Promise<{ allowed: boolean; openCount: number }> {
  const closedStatuses = ["DELIVERED", "CANCELLED"] as const;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        sql`(${bookings.customerId} = ${customerId} OR ${bookings.deviceFingerprint} = ${deviceFingerprint})`,
        notInArray(bookings.status, [...closedStatuses])
      )
    );

  const openCount = Number(result[0]?.count || 0);
  return {
    allowed: openCount < env.MAX_OPEN_BOOKINGS_PER_PHONE,
    openCount,
  };
}
