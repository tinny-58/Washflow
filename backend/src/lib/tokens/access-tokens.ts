import crypto from "crypto";
import { db } from "../../db";
import { orderAccessTokens, bookings } from "../../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { env } from "../env";

/**
 * Generates a high-entropy 128-bit unguessable scoped token.
 * 24 bytes of cryptographically secure randomness (192 bits) encoded as base64url.
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Creates or retrieves a scoped access token for order tracking or rating.
 * Scoped strictly to one order, expiring shortly after delivery (default 14 days),
 * revocable, and impossible to guess or enumerate.
 */
export async function createOrderAccessToken(params: {
  bookingId: string;
  purpose: "track" | "rate";
  expiresInDays?: number;
}): Promise<string> {
  const { bookingId, purpose, expiresInDays = 14 } = params;

  // Check if an active, unexpired token already exists for this booking & purpose
  const existing = await db.query.orderAccessTokens.findFirst({
    where: and(
      eq(orderAccessTokens.bookingId, bookingId),
      eq(orderAccessTokens.purpose, purpose),
      sql`${orderAccessTokens.revokedAt} IS NULL`,
      sql`${orderAccessTokens.expiresAt} > NOW()`
    ),
  });

  if (existing) {
    return existing.token;
  }

  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await db.insert(orderAccessTokens).values({
    token,
    bookingId,
    purpose,
    expiresAt,
  });

  return token;
}

/**
 * Generates the full public tracking URL for a booking.
 */
export async function getSecureTrackingUrl(bookingId: string): Promise<string> {
  const token = await createOrderAccessToken({ bookingId, purpose: "track" });
  return `${env.NEXT_PUBLIC_APP_URL}/track/${token}`;
}

/**
 * Generates the full public rating URL for a booking.
 */
export async function getSecureRatingUrl(bookingId: string): Promise<string> {
  const token = await createOrderAccessToken({ bookingId, purpose: "rate" });
  return `${env.NEXT_PUBLIC_APP_URL}/rate/${token}`;
}

/**
 * Verifies a scoped access token.
 */
export async function verifyOrderAccessToken(
  token: string,
  expectedPurpose?: "track" | "rate"
): Promise<{
  valid: boolean;
  bookingId?: string;
  purpose?: string;
  error?: string;
}> {
  if (!token || typeof token !== "string" || token.length < 16) {
    return { valid: false, error: "Invalid access token." };
  }

  const row = await db.query.orderAccessTokens.findFirst({
    where: eq(orderAccessTokens.token, token),
  });

  if (!row) {
    return { valid: false, error: "Access token not found or invalid." };
  }

  if (row.revokedAt) {
    return { valid: false, error: "This order link has been revoked." };
  }

  if (new Date() > row.expiresAt) {
    return { valid: false, error: "This order link has expired." };
  }

  if (expectedPurpose && row.purpose !== expectedPurpose) {
    return { valid: false, error: "Access token purpose mismatch." };
  }

  return {
    valid: true,
    bookingId: row.bookingId,
    purpose: row.purpose,
  };
}

/**
 * Revokes an access token immediately.
 */
export async function revokeOrderAccessToken(token: string): Promise<boolean> {
  const result = await db
    .update(orderAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(orderAccessTokens.token, token))
    .returning();

  return result.length > 0;
}
