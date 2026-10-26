import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Request, Response } from "express";
import argon2 from "argon2";
import { db } from "../db";
import { sessions, users, verificationTokens } from "../db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { env } from "./env";
import { getClientIpHash } from "./security";

export const SESSION_COOKIE_NAME =
  env.NODE_ENV === "production" ? "__Host-wf_session" : "wf_session";
export const PREAUTH_COOKIE_NAME =
  env.NODE_ENV === "production" ? "__Host-wf_preauth" : "wf_preauth";

// Session timeout constants
export const CUSTOMER_IDLE_TIMEOUT_SECONDS = 60 * 60 * 24; // 24 hours
export const CUSTOMER_ABSOLUTE_TIMEOUT_SECONDS = 60 * 60 * 24 * 14; // 14 days

export const ADMIN_IDLE_TIMEOUT_SECONDS = 60 * 15; // 15 minutes
export const ADMIN_ABSOLUTE_TIMEOUT_SECONDS = 60 * 60 * 8; // 8 hours

export const PREAUTH_TIMEOUT_SECONDS = 60 * 10; // 10 minutes

// In-memory set of revoked session token hashes for instant synchronous invalidation
const revokedTokenHashes = new Set<string>();

// Pre-computed Argon2id hash for constant-time dummy verification on missing users
export const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzdHJpbmc$5M/q8R8B+9hF3v1Xq8R8B+9hF3v1Xq8R8B+9hF3v1Xo";

export interface SessionPayload {
  userId: string;
  id: string;
  name: string;
  role: "customer" | "client" | "admin" | "user";
  username?: string;
  businessName?: string;
  phone?: string;
  phoneE164?: string;
  email?: string;
  authProvider?: string;
}

export type SessionUser = SessionPayload;

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(data: string): string {
  let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export function createSessionToken(
  payload: {
    userId: string;
    name: string;
    role: "customer" | "client" | "admin" | "user";
    phone?: string;
    phoneE164?: string;
    username?: string;
    businessName?: string;
    email?: string;
  },
  expiresInSeconds: number = 60 * 60 * 24 * 14
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const fullPayload = {
    ...payload,
    id: payload.userId,
    jti: randomBytes(16).toString("hex"),
    iat,
    exp,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = createHmac("sha256", env.SESSION_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 session token.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = createHmac("sha256", env.SESSION_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return {
      userId: payload.userId,
      id: payload.userId,
      name: payload.name,
      businessName: payload.businessName,
      role: payload.role,
      username: payload.username,
      phone: payload.phone,
      phoneE164: payload.phoneE164,
      email: payload.email,
      authProvider: payload.authProvider,
    };
  } catch {
    return null;
  }
}

/**
 * Computes SHA-256 hash of a session token for database storage.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a 256-bit cryptographically secure session token.
 */
export function generateSecureToken(prefix = "wf_s"): string {
  const bytes = randomBytes(32);
  return `${prefix}_${bytes.toString("base64url")}`;
}

/**
 * Attaches the session cookie to an Express response.
 * Uses __Host- prefix in production with Secure, HttpOnly, Path=/, and SameSite.
 */
export function setSessionCookie(
  res: Response,
  token: string,
  maxAgeMs: number,
  role: "customer" | "client" | "admin" | "user" = "customer",
  isHttps = false
) {
  const isProduction = env.NODE_ENV === "production";
  const secure = isProduction || isHttps;

  res.cookie(SESSION_COOKIE_NAME, token, {
    maxAge: maxAgeMs,
    httpOnly: true,
    sameSite: role === "admin" ? "strict" : "lax",
    secure,
    path: "/",
  });
}

/**
 * Clears the session cookie from an Express response.
 */
export function clearSessionCookie(res: Response, isHttps = false) {
  const isProduction = env.NODE_ENV === "production";
  const secure = isProduction || isHttps;

  // Clear both production and development cookie names to prevent orphaned state
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
  if (SESSION_COOKIE_NAME !== "wf_session") {
    res.clearCookie("wf_session", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    });
  }
}

/**
 * Attaches pre-auth temporary cookie for stepped-up admin auth or OAuth binding.
 */
export function setPreauthCookie(res: Response, token: string, isHttps = false) {
  const isProduction = env.NODE_ENV === "production";
  const secure = isProduction || isHttps;

  res.cookie(PREAUTH_COOKIE_NAME, token, {
    maxAge: PREAUTH_TIMEOUT_SECONDS * 1000,
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
  });
}

/**
 * Clears the pre-auth cookie.
 */
export function clearPreauthCookie(res: Response, isHttps = false) {
  const isProduction = env.NODE_ENV === "production";
  const secure = isProduction || isHttps;

  res.clearCookie(PREAUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
  });
  if (PREAUTH_COOKIE_NAME !== "wf_preauth") {
    res.clearCookie("wf_preauth", {
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/",
    });
  }
}

function extractRawToken(req: Request, cookieName: string): string | null {
  const fromCookie =
    req.cookies?.[cookieName] ||
    req.cookies?.[cookieName.replace(/^__Host-/, "")] ||
    req.cookies?.[`__Host-${cookieName}`];
  if (fromCookie && typeof fromCookie === "string") {
    return fromCookie.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Creates an authenticated session in PostgreSQL and sets the httpOnly cookie.
 */
export async function createSession({
  userId,
  req,
  res,
}: {
  userId: string;
  req: Request;
  res: Response;
}): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || user.isBlocked) {
    throw new Error("Cannot create session for inactive or blocked user.");
  }

  const isAdmin = user.role === "admin";
  const idleTimeout = isAdmin
    ? ADMIN_IDLE_TIMEOUT_SECONDS
    : CUSTOMER_IDLE_TIMEOUT_SECONDS;
  const absoluteTimeout = isAdmin
    ? ADMIN_ABSOLUTE_TIMEOUT_SECONDS
    : CUSTOMER_ABSOLUTE_TIMEOUT_SECONDS;

  const rawToken = generateSecureToken("wf_s");
  const sessionTokenHash = hashSessionToken(rawToken);
  const ipHash = getClientIpHash(req);
  const userAgent = ((req.headers["user-agent"] as string) || "unknown").slice(0, 255);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + absoluteTimeout * 1000);
  const idleExpiresAt = new Date(now.getTime() + idleTimeout * 1000);

  // Store server-authoritative session record
  await db.insert(sessions).values({
    userId,
    sessionTokenHash,
    ipHash,
    userAgent,
    expiresAt,
    idleExpiresAt,
    lastActiveAt: now,
  });

  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  setSessionCookie(res, rawToken, absoluteTimeout * 1000, user.role, isHttps);
  return rawToken;
}

/**
 * Creates a pre-auth session ticket (used for Admin WhatsApp OTP step-up or Google OAuth phone binding).
 */
export async function createPreauthSession({
  userId,
  purpose,
  metadata,
  req,
  res,
}: {
  userId?: string;
  purpose: "admin_stepup" | "google_signup";
  metadata?: Record<string, any>;
  req: Request;
  res: Response;
}): Promise<string> {
  const rawToken = generateSecureToken("wf_pre");
  const tokenHash = hashSessionToken(rawToken);
  const identifierHash = createHash("sha256")
    .update(userId || metadata?.email || rawToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + PREAUTH_TIMEOUT_SECONDS * 1000);

  await db.insert(verificationTokens).values({
    tokenHash,
    identifierHash,
    purpose,
    sessionBindingId: rawToken.slice(0, 24),
    metadata: metadata ? JSON.stringify(metadata) : null,
    expiresAt,
  });

  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  setPreauthCookie(res, rawToken, isHttps);
  return rawToken;
}

/**
 * Validates and retrieves the pre-auth session from the request.
 */
export async function getPreauthSessionFromReq(
  req: Request,
  purpose: "admin_stepup" | "google_signup"
): Promise<{ valid: boolean; metadata?: Record<string, any>; error?: string }> {
  const rawToken = extractRawToken(req, PREAUTH_COOKIE_NAME);
  if (!rawToken) {
    return { valid: false, error: "Missing pre-authentication session." };
  }

  const tokenHash = hashSessionToken(rawToken);
  const record = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.tokenHash, tokenHash),
      eq(verificationTokens.purpose, purpose),
      isNull(verificationTokens.consumedAt)
    ),
  });

  if (!record) {
    return { valid: false, error: "Invalid or expired pre-authentication session." };
  }

  if (new Date() > record.expiresAt) {
    return { valid: false, error: "Pre-authentication session expired. Please sign in again." };
  }

  let metadata: Record<string, any> = {};
  if (record.metadata) {
    try {
      metadata = JSON.parse(record.metadata);
    } catch {}
  }

  return { valid: true, metadata };
}

/**
 * Consumes the pre-auth session atomically so it cannot be reused.
 */
export async function consumePreauthSession(req: Request, res: Response, isHttps = false): Promise<void> {
  const rawToken = extractRawToken(req, PREAUTH_COOKIE_NAME);
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    await db
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(verificationTokens.tokenHash, tokenHash))
      .catch(() => {});
  }
  clearPreauthCookie(res, isHttps);
}

/**
 * Retrieves the current session from an Express request server-authoritatively against PostgreSQL.
 * Validates:
 * 1. Session token exists in cookie or Bearer header
 * 2. Hash matches an unrevoked record in `sessions` table
 * 3. Session has not exceeded absolute timeout (`expiresAt > now`)
 * 4. Session has not exceeded idle timeout (`idleExpiresAt > now`)
 * 5. Associated user account is active and not blocked
 *
 * Sliding idle window: If active and > 60 seconds since lastActiveAt, updates `idleExpiresAt` and `lastActiveAt`.
 */
export async function getSessionFromReq(req: Request): Promise<SessionPayload | null> {
  const rawToken = extractRawToken(req, SESSION_COOKIE_NAME);
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);

  // Quick rejection if marked revoked in memory
  if (revokedTokenHashes.has(tokenHash)) {
    return null;
  }

  try {
    const rows = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        name: users.name,
        role: users.role,
        username: users.username,
        phone: users.phone,
        phoneE164: users.phoneE164,
        email: users.email,
        authProvider: users.authProvider,
        isBlocked: users.isBlocked,
        expiresAt: sessions.expiresAt,
        idleExpiresAt: sessions.idleExpiresAt,
        lastActiveAt: sessions.lastActiveAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.sessionTokenHash, tokenHash),
          isNull(sessions.revokedAt)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const session = rows[0];
    const now = new Date();

    // Check blocked status
    if (session.isBlocked) {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, session.sessionId));
      revokedTokenHashes.add(tokenHash);
      return null;
    }

    // Check absolute expiration
    if (now > session.expiresAt) {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, session.sessionId));
      revokedTokenHashes.add(tokenHash);
      return null;
    }

    // Check idle expiration
    if (now > session.idleExpiresAt) {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, session.sessionId));
      revokedTokenHashes.add(tokenHash);
      return null;
    }

    // Sliding window update: if more than 60 seconds since last activity, update idle expiration
    const lastActive = new Date(session.lastActiveAt).getTime();
    if (now.getTime() - lastActive > 60 * 1000) {
      const idleTimeout =
        session.role === "admin"
          ? ADMIN_IDLE_TIMEOUT_SECONDS
          : CUSTOMER_IDLE_TIMEOUT_SECONDS;
      const newIdleExpiresAt = new Date(now.getTime() + idleTimeout * 1000);

      // Async background update without blocking response
      db.update(sessions)
        .set({
          lastActiveAt: now,
          idleExpiresAt: newIdleExpiresAt,
        })
        .where(eq(sessions.id, session.sessionId))
        .catch((err) => console.error("Error updating session idle sliding window:", err));
    }

    return {
      userId: session.userId,
      id: session.userId,
      name: session.name,
      role: session.role,
      username: session.username || undefined,
      phone: session.phone || undefined,
      phoneE164: session.phoneE164 || undefined,
      email: session.email || undefined,
      authProvider: session.authProvider || undefined,
    };
  } catch (err) {
    console.error("Session verification error:", err);
    return null;
  }
}

/**
 * Revokes current session from both PostgreSQL DB and cookie.
 */
export async function revokeCurrentSession(req: Request, res: Response): Promise<void> {
  const rawToken = extractRawToken(req, SESSION_COOKIE_NAME);

  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    revokedTokenHashes.add(tokenHash);
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.sessionTokenHash, tokenHash))
      .catch(() => {});
  }

  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  clearSessionCookie(res, isHttps);
  clearPreauthCookie(res, isHttps);
}

/**
 * Revokes all sessions for a user (called after password reset).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  try {
    const userSessions = await db
      .select({ tokenHash: sessions.sessionTokenHash })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    for (const s of userSessions) {
      revokedTokenHashes.add(s.tokenHash);
    }

    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  } catch (err) {
    console.error("Error revoking all user sessions:", err);
  }
}

/**
 * Verifies password with constant-time dummy hashing when user does not exist.
 * Protects against timing enumeration attacks.
 */
export async function verifyPasswordConstantTime({
  candidatePassword,
  storedHash,
}: {
  candidatePassword: string;
  storedHash?: string | null;
}): Promise<boolean> {
  if (storedHash) {
    try {
      return await argon2.verify(storedHash, candidatePassword);
    } catch {
      return false;
    }
  }

  // User does not exist: run dummy argon2 verify to equalize timing against timing attacks
  try {
    await argon2.verify(DUMMY_ARGON2_HASH, candidatePassword);
  } catch {}
  return false;
}
