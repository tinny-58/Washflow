import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/server";
import { db, pool } from "../src/db";
import { users, otpCodes, sessions, verificationTokens } from "../src/db/schema";
import { eq, or, sql } from "drizzle-orm";
import {
  createAndStoreOtp,
  verifyAndConsumeOtp,
  consumeVerificationToken,
  hashOtp,
} from "../src/lib/otp";
import {
  createSession,
  getSessionFromReq,
  revokeAllUserSessions,
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/session";
import { getRedisClient } from "../src/lib/baileys/queue";
import crypto from "crypto";

describe("Production Concurrency & Security Test Suite", () => {
  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const testPhone = `+254700${randSuffix}`;
  const testUsername = `race_user_${randSuffix.toString().slice(0, 4)}`;

  beforeAll(async () => {
    // Clean up test records
    await db.delete(users).where(
      or(
        sql`lower(${users.username}) = lower(${testUsername})`,
        eq(users.phone, testPhone),
        eq(users.phoneE164, testPhone)
      )
    );

    // Seed Redis cache so checkNumberOnWhatsApp returns instantly without RPC
    const redis = getRedisClient();
    await redis.setex(`wa:exists:${testPhone}`, 86400, "1");
  });

  afterAll(async () => {
    await db.delete(users).where(
      or(
        sql`lower(${users.username}) = lower(${testUsername})`,
        eq(users.phone, testPhone),
        eq(users.phoneE164, testPhone)
      )
    );
  });

  // ==========================================================================
  // 1. CONCURRENCY: 50 Concurrent Verifications Race
  // ==========================================================================
  it("guarantees exactly 1 winner among 50 concurrent OTP verifications", async () => {
    const racePhone = `+254712${Math.floor(100000 + Math.random() * 900000)}`;
    const raceCode = "738491";
    const salt = crypto.randomBytes(16).toString("hex");
    const codeHash = hashOtp(raceCode, salt);
    const idHash = crypto.createHash("sha256").update(racePhone).digest("hex");
    const sessionBinding = "race_session_test_123";

    // Insert 1 active OTP directly into otp_codes
    const [inserted] = await db
      .insert(otpCodes)
      .values({
        purpose: "signup",
        identifier: racePhone,
        identifierHash: idHash,
        sessionBindingId: sessionBinding,
        codeHash,
        salt,
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      })
      .returning();

    expect(inserted.id).toBeDefined();

    // Fire 50 concurrent verification requests
    const promises = Array.from({ length: 50 }, () =>
      verifyAndConsumeOtp({
        e164Phone: racePhone,
        code: raceCode,
        purpose: "signup",
        sessionBindingId: sessionBinding,
      })
    );

    const results = await Promise.all(promises);

    const successCount = results.filter((r) => r.success === true).length;
    const failureCount = results.filter((r) => r.success === false).length;

    // EXACTLY 1 request must consume the code and receive the verificationToken
    expect(successCount).toBe(1);
    expect(failureCount).toBe(49);

    // Verify token was stored and code is consumed in database
    const dbRecord = await db.query.otpCodes.findFirst({
      where: eq(otpCodes.id, inserted.id),
    });
    expect(dbRecord?.consumedAt).not.toBeNull();
  });

  // ==========================================================================
  // 2. CONCURRENCY: Concurrent Verification Token Consumption Race
  // ==========================================================================
  it("guarantees single-use token cannot be consumed by parallel signup requests", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const idHash = crypto.createHash("sha256").update(testPhone).digest("hex");
    const sessionBinding = "binding_signup_race";

    // Insert 1 active verification token
    await db.insert(verificationTokens).values({
      tokenHash,
      identifierHash: idHash,
      purpose: "signup",
      sessionBindingId: sessionBinding,
      metadata: JSON.stringify({ phone: testPhone }),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // Fire 10 parallel consumers simultaneously
    const promises = Array.from({ length: 10 }, () =>
      consumeVerificationToken({
        token: rawToken,
        expectedPurpose: "signup",
        sessionBindingId: sessionBinding,
      })
    );

    const results = await Promise.all(promises);

    const validCount = results.filter((r) => r.valid === true).length;
    const invalidCount = results.filter((r) => r.valid === false).length;

    // Exactly one consumption succeeds
    expect(validCount).toBe(1);
    expect(invalidCount).toBe(9);
  });

  // ==========================================================================
  // 3. SESSIONS: Immediate Multi-Device Revocation on Password Reset
  // ==========================================================================
  it("instantly invalidates all active sessions for a user across all devices", async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        name: "Revoke Test User",
        username: `rev_user_${randSuffix}`,
        phone: `+254722${randSuffix}`,
        phoneE164: `+254722${randSuffix}`,
        role: "customer",
      })
      .returning();

    // Create 3 active sessions for this user
    const token1 = crypto.randomBytes(32).toString("base64url");
    const token2 = crypto.randomBytes(32).toString("base64url");
    const token3 = crypto.randomBytes(32).toString("base64url");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    const idleExpiresAt = new Date(now.getTime() + 24 * 3600 * 1000);

    for (const rawToken of [token1, token2, token3]) {
      await db.insert(sessions).values({
        userId: user.id,
        sessionTokenHash: hashSessionToken(rawToken),
        ipHash: "testhash",
        expiresAt,
        idleExpiresAt,
      });
    }

    // Verify sessions are currently valid
    const mockReq1 = {
      cookies: { [SESSION_COOKIE_NAME]: token1 },
      headers: {},
    } as any;
    const s1Before = await getSessionFromReq(mockReq1);
    expect(s1Before?.userId).toBe(user.id);

    // Trigger revocation of all user sessions
    await revokeAllUserSessions(user.id);

    // Verify all 3 sessions are now rejected
    for (const token of [token1, token2, token3]) {
      const mockReq = {
        cookies: { [SESSION_COOKIE_NAME]: token },
        headers: {},
      } as any;
      const sAfter = await getSessionFromReq(mockReq);
      expect(sAfter).toBeNull();
    }
  });

  // ==========================================================================
  // 4. LEAK SCAN: Assert zero OTP, hash, or dev fields in API responses
  // ==========================================================================
  it("confirms API endpoints never return OTPs, hashes, or debug fields", async () => {
    // 1. Signup request
    const res1 = await request(app)
      .post("/api/auth/signup/otp/request")
      .send({ phone: testPhone });

    expect(res1.body).not.toHaveProperty("devCode");
    expect(res1.body).not.toHaveProperty("rawCode");
    expect(res1.body).not.toHaveProperty("code");
    expect(res1.body).not.toHaveProperty("codeHash");
    expect(res1.body).not.toHaveProperty("salt");
    expect(res1.body).not.toHaveProperty("alreadyRegistered");

    // 2. Forgot password request
    const res2 = await request(app)
      .post("/api/auth/forgot-password/request")
      .send({ identifier: "non_existent_user_12345" });

    expect(res2.body).not.toHaveProperty("devCode");
    expect(res2.body).not.toHaveProperty("code");
    expect(res2.body.message).toBe("If an account exists, a verification code has been sent.");

    // 3. Login failure
    const res3 = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "WrongPassword123!" });

    expect(res3.status).toBe(401);
    expect(res3.body).not.toHaveProperty("devCode");
    expect(res3.body).not.toHaveProperty("stack");
    expect(res3.body.error).toBe("Invalid username or password.");
  });
});
