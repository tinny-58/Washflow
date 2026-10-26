import { createHmac, createHash, randomUUID } from "crypto";
import { Request, Response } from "express";
import { db } from "../db";
import { users, bookings } from "../db/schema";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { env } from "./env";

export const DEVICE_COOKIE_NAME = "wf_did";

/**
 * Extracts client IP from Express request.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0].split(",")[0].trim();
  }
  if (typeof realIp === "string") {
    return realIp;
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

/**
 * Extracts and hashes the client's IP address with a salt.
 * Ensures raw IP addresses are never persisted in the database.
 */
export function getClientIpHash(req: Request): string {
  const rawIp = getClientIp(req);
  return createHash("sha256")
    .update(`${rawIp}:${env.SESSION_SECRET}`)
    .digest("hex");
}

/**
 * Gets or creates a privacy-respecting signed device fingerprint.
 * Combines an httpOnly signed device ID cookie with a hashed User-Agent and IP subnet.
 */
export function getDeviceFingerprint(req: Request, res?: Response): {
  fingerprint: string;
  isNewCookie: boolean;
  rawDeviceId: string;
} {
  const userAgent = (req.headers["user-agent"] as string) || "unknown-agent";
  const ipHash = getClientIpHash(req);

  let rawDeviceId = req.cookies?.[DEVICE_COOKIE_NAME];
  let isNew = false;

  if (!rawDeviceId) {
    rawDeviceId = randomUUID();
    isNew = true;
    if (res) {
      setDeviceCookie(res, rawDeviceId);
    }
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
export function setDeviceCookie(res: Response, rawDeviceId: string) {
  const isProduction = env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 365 * 2 * 1000; // 2 years in ms
  res.cookie(DEVICE_COOKIE_NAME, rawDeviceId, {
    maxAge,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
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
): Promise<{ allowed: boolean; activeCount: number }> {
  const activeBookings = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.customerId, customerId),
        notInArray(bookings.status, ["DELIVERED", "CANCELLED"])
      )
    );

  const activeCount = Number(activeBookings[0]?.count || 0);
  return {
    allowed: activeCount < env.MAX_OPEN_BOOKINGS_PER_PHONE,
    activeCount,
  };
}
