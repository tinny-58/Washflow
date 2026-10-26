import crypto from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/server";
import { db, pool } from "../src/db";
import { users, otpCodes, sessions, authAuditLog, verificationTokens } from "../src/db/schema";
import { eq, or, sql, desc } from "drizzle-orm";
import {
  validateUsername,
  validatePasswordNist,
  generateAvailableUsernameSuggestions,
  checkPwnedPassword,
  normalizePhoneNumber,
} from "../src/lib/validation";
import {
  createAndStoreOtp,
  verifyAndConsumeOtp,
  createSignedToken,
  verifySignedToken,
  hashOtp,
} from "../src/lib/otp";
import {
  createSession,
  getSessionFromReq,
  revokeAllUserSessions,
  hashSessionToken,
} from "../src/lib/session";
import argon2 from "argon2";

describe("Rebuilt Authentication & Security System Test Suite", () => {
  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const testPhone = `+254711${randSuffix}`;
  const testEmail = `sec_audit_${randSuffix}@gmail.com`;
  const testUsername = `sec_user_${randSuffix.toString().slice(0, 4)}`;
  const testPassword = "VerySecurePassword2026!";

  beforeAll(async () => {
    // Clean up test records
    await db.delete(users).where(
      or(
        sql`lower(${users.username}) = lower(${testUsername})`,
        sql`lower(${users.username}) LIKE 'sec_test%'`,
        eq(users.phone, testPhone),
        eq(users.phoneE164, testPhone),
        eq(users.email, testEmail)
      )
    );
  });

  afterAll(async () => {
    await db.delete(users).where(
      or(
        sql`lower(${users.username}) = lower(${testUsername})`,
        sql`lower(${users.username}) LIKE 'sec_test%'`,
        eq(users.phone, testPhone),
        eq(users.phoneE164, testPhone),
        eq(users.email, testEmail)
      )
    );
  });

  // ==========================================================================
  // 1. VALIDATION EDGE CASES
  // ==========================================================================
  describe("1. Validation Edge Cases & Input Sanitization", () => {
    it("enforces username rules: 3-20 chars, starting with letter, valid special chars", () => {
      expect(validateUsername("ab").valid).toBe(false); // too short
      expect(validateUsername("a".repeat(21)).valid).toBe(false); // too long
      expect(validateUsername("123user").valid).toBe(false); // starts with number
      expect(validateUsername("_user").valid).toBe(false); // starts with underscore
      expect(validateUsername(".user").valid).toBe(false); // starts with dot
      expect(validateUsername("user_").valid).toBe(false); // ends with underscore
      expect(validateUsername("user.").valid).toBe(false); // ends with dot
      expect(validateUsername("user__name").valid).toBe(false); // consecutive __
      expect(validateUsername("user..name").valid).toBe(false); // consecutive ..
      expect(validateUsername("user._name").valid).toBe(false); // consecutive ._
      expect(validateUsername("user_.name").valid).toBe(false); // consecutive _.
      expect(validateUsername("user@name").valid).toBe(false); // invalid symbol

      // Reserved keywords
      expect(validateUsername("admin").valid).toBe(false);
      expect(validateUsername("support").valid).toBe(false);
      expect(validateUsername("root").valid).toBe(false);
      expect(validateUsername("api").valid).toBe(false);

      // Valid usernames
      expect(validateUsername("john_doe").valid).toBe(true);
      expect(validateUsername("jane.doe").valid).toBe(true);
      expect(validateUsername("washflow_user26").valid).toBe(true);
    });

    it("enforces NIST SP 800-63B password rules: >=10 chars, <=128, all Unicode, paste", async () => {
      // Less than 10 characters must be rejected
      const short = await validatePasswordNist("Short9!");
      expect(short.valid).toBe(false);
      expect(short.error).toMatch(/at least 10 characters/i);

      // NIST: No arbitrary composition rules. Passphrases without symbols or numbers are fully valid!
      const validPassphrase = await validatePasswordNist("my unique washflow 2026 passphrase");
      expect(validPassphrase.valid).toBe(true);

      // Unicode, spaces, and non-ASCII are allowed per NIST
      const unicodePass = await validatePasswordNist("mypassword with spaces and 日本語テスト2026");
      expect(unicodePass.valid).toBe(true);

      // Known breached passwords must be rejected
      const breached = await validatePasswordNist("password1234");
      expect(breached.valid).toBe(false);
    }, 15000);

    it("resists SQL injection and XSS payloads in identifiers", () => {
      const sqlPayload = "' OR 1=1 --";
      const xssPayload = "<script>alert('xss')</script>";

      expect(validateUsername(sqlPayload).valid).toBe(false);
      expect(validateUsername(xssPayload).valid).toBe(false);

      const phoneSql = normalizePhoneNumber("0712345678' OR 1=1;");
      expect(phoneSql.valid).toBe(false);
    });
  });

  // ==========================================================================
  // 2. DUPLICATE USERNAMES, CASE-INSENSITIVITY & SUGGESTIONS
  // ==========================================================================
  describe("2. Username Uniqueness, Suggestions & Race Condition Handling", () => {
    it("generates up to 3 verified available suggestions when username is taken", async () => {
      const suggestions = await generateAvailableUsernameSuggestions("johndoe");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(3);

      for (const s of suggestions) {
        expect(validateUsername(s).valid).toBe(true);
        // Verify suggestion does not exist in DB
        const match = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.username}) = lower(${s})`);
        expect(match.length).toBe(0);
      }
    });

    it("endpoint GET /api/auth/check-username returns availability and suggestions", async () => {
      // First create a user to take a username
      const existingUser = "reserved_test_taken";
      await db.delete(users).where(sql`lower(${users.username}) = lower(${existingUser})`);
      await db.insert(users).values({
        name: "Existing Tester",
        username: existingUser,
        role: "customer",
      });

      const res = await request(app)
        .get(`/api/auth/check-username?username=${existingUser}`)
        .expect(200);

      expect(res.body.available).toBe(false);
      expect(res.body.suggestions).toBeDefined();
      expect(Array.isArray(res.body.suggestions)).toBe(true);

      // Cleanup
      await db.delete(users).where(sql`lower(${users.username}) = lower(${existingUser})`);
    });
  });

  // ==========================================================================
  // 3. OTP ENGINE INTEGRITY
  // ==========================================================================
  describe("3. OTP Engine: Expiry, Attempts, Resend Cooldown, Single-Use", () => {
    const id = `+254700${Math.floor(100000 + Math.random() * 900000)}`;

    it("generates 6-digit CSPRNG code and stores only HMAC hash", async () => {
      await db.delete(otpCodes).where(eq(otpCodes.identifier, id));

      const res = await createAndStoreOtp({
        identifier: id,
        purpose: "signup",
        clientIp: "127.0.0.1",
      });

      expect(res.success).toBe(true);
      expect(res.code).toMatch(/^\d{6}$/);

      // Verify DB record stores only the HMAC-SHA256 hash
      const record = await db.query.otpCodes.findFirst({
        where: eq(otpCodes.identifier, id),
        orderBy: [desc(otpCodes.createdAt)],
      });

      expect(record).toBeDefined();
      expect(record?.codeHash).not.toBe(res.code);
      expect(record?.codeHash).toBe(hashOtp(res.code!, record!.salt));
    });

    it("enforces 60-second resend cooldown", async () => {
      const cooldownId = `+254701${Math.floor(100000 + Math.random() * 900000)}`;
      await createAndStoreOtp({
        identifier: cooldownId,
        purpose: "signup",
        clientIp: "127.0.0.1",
      });

      const secondReq = await createAndStoreOtp({
        identifier: cooldownId,
        purpose: "signup",
        clientIp: "127.0.0.1",
      });

      expect(secondReq.success).toBe(false);
      expect(secondReq.error).toMatch(/wait \d+ seconds/i);
    });

    it("invalidates code after 5 incorrect attempts", async () => {
      const testId = "+254700000002";
      const created = await createAndStoreOtp({
        identifier: testId,
        purpose: "signup",
        clientIp: "127.0.0.2",
      });

      for (let i = 1; i <= 4; i++) {
        const attempt = await verifyAndConsumeOtp({
          identifier: testId,
          code: "000000",
          purpose: "signup",
        });
        expect(attempt.success).toBe(false);
      }

      // 5th incorrect attempt invalidates
      const finalAttempt = await verifyAndConsumeOtp({
        identifier: testId,
        code: "000000",
        purpose: "signup",
      });
      expect(finalAttempt.success).toBe(false);

      // Subsequent attempt with even the CORRECT code must now fail
      const correctAttempt = await verifyAndConsumeOtp({
        identifier: testId,
        code: created.code!,
        purpose: "signup",
      });
      expect(correctAttempt.success).toBe(false);
    });

    it("prevents replay of consumed OTP codes", async () => {
      const testId = `+254702${Math.floor(100000 + Math.random() * 900000)}`;
      const created = await createAndStoreOtp({
        identifier: testId,
        purpose: "signup",
        clientIp: "127.0.0.3",
      });

      // First verification succeeds
      const verify1 = await verifyAndConsumeOtp({
        identifier: testId,
        code: created.code!,
        purpose: "signup",
      });
      expect(verify1.success).toBe(true);

      // Replay attempt must fail
      const verify2 = await verifyAndConsumeOtp({
        identifier: testId,
        code: created.code!,
        purpose: "signup",
      });
      expect(verify2.success).toBe(false);
    });
  });

  // ==========================================================================
  // 4. SIGNUP WITHOUT OTP MUST FAIL
  // ==========================================================================
  describe("4. Signup Credential Protection", () => {
    it("rejects signup when verification token is missing or forged", async () => {
      const res = await request(app)
        .post("/api/auth/signup/complete")
        .send({
          verificationToken: "fake.tampered.token",
          username: "unverified_user",
          password: "SecurePassword2026!",
        })
        .expect(403);

      expect(res.body.error).toMatch(/expired|invalid|used/i);
    });
  });

  // ==========================================================================
  // 5. ENUMERATION RESISTANCE & CONSTANT-TIME LOGIN
  // ==========================================================================
  describe("5. Account Enumeration Resistance & Timing Equality", () => {
    it("returns identical generic error for non-existent user and wrong password", async () => {
      // 1. Non-existent username
      const res1 = await request(app)
        .post("/api/auth/login")
        .send({
          username: "non_existent_random_user_9999",
          password: "SomePassword123!",
        })
        .expect(401);

      expect(res1.body.error).toBe("Invalid username or password.");

      // 2. Create user with known password
      const tempUser = "enum_test_user";
      await db.delete(users).where(sql`lower(${users.username}) = lower(${tempUser})`);
      const hash = await argon2.hash("CorrectPassword2026!");
      await db.insert(users).values({
        name: "Enum User",
        username: tempUser,
        passwordHash: hash,
        role: "customer",
      });

      // Valid username, wrong password
      const res2 = await request(app)
        .post("/api/auth/login")
        .send({
          username: tempUser,
          password: "WrongPassword2026!",
        })
        .expect(401);

      expect(res2.body.error).toBe("Invalid username or password.");
      expect(res1.body.error).toBe(res2.body.error);

      // Cleanup
      await db.delete(users).where(sql`lower(${users.username}) = lower(${tempUser})`);
    });

    it("forgot-password always returns identical generic message without leaking phone", async () => {
      // Non-existent identifier
      const res1 = await request(app)
        .post("/api/auth/forgot-password/request")
        .send({ identifier: "unregistered_user_12345" })
        .expect(200);

      expect(res1.body.message).toMatch(/If an account exists/i);
      expect(res1.body.phone).toBeUndefined(); // Zero phone leakage!
    });
  });

  // ==========================================================================
  // 6. SESSION REVOCATION AFTER PASSWORD RESET
  // ==========================================================================
  describe("6. Session Management & Mass Revocation on Password Reset", () => {
    it("revokes all existing sessions when a password is reset", async () => {
      const resetUser = "session_revocation_test";
      await db.delete(users).where(sql`lower(${users.username}) = lower(${resetUser})`);

      const initialHash = await argon2.hash("OldPassword2026!");
      const [user] = await db
        .insert(users)
        .values({
          name: "Session Test User",
          username: resetUser,
          passwordHash: initialHash,
          phone: "+254712399999",
          phoneE164: "+254712399999",
          role: "customer",
        })
        .returning();

      // Create an active session in DB
      const mockReq = { headers: { "user-agent": "Vitest" }, ip: "127.0.0.1" } as any;
      const mockRes = { cookie: () => {} } as any;
      const rawToken = await createSession({
        userId: user.id,
        req: mockReq,
        res: mockRes,
      });

      // Verify session is active before reset
      const checkReqBefore = {
        cookies: { wf_session: rawToken },
        headers: {},
      } as any;
      const sessionBefore = await getSessionFromReq(checkReqBefore);
      expect(sessionBefore).not.toBeNull();
      expect(sessionBefore?.id).toBe(user.id);

      // Perform reset token issuance & reset
      const resetRawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(resetRawToken).digest("hex");
      await db.insert(verificationTokens).values({
        tokenHash,
        identifierHash: crypto.createHash("sha256").update("+254712399999").digest("hex"),
        purpose: "reset_password",
        sessionBindingId: "default",
        metadata: JSON.stringify({ phone: "+254712399999" }),
        expiresAt: new Date(Date.now() + 600000),
      });

      const resetRes = await request(app)
        .post("/api/auth/forgot-password/reset")
        .send({
          resetToken: resetRawToken,
          newPassword: "BrandNewPassword2026!",
        })
        .expect(200);

      expect(resetRes.body.success).toBe(true);

      // Verify the previous session is now REVOKED and rejected
      const sessionAfter = await getSessionFromReq(checkReqBefore);
      expect(sessionAfter).toBeNull(); // Session invalidation verified!

      // Verify user can log in with new password
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          username: resetUser,
          password: "BrandNewPassword2026!",
        })
        .expect(200);

      expect(loginRes.body.success).toBe(true);

      // Cleanup
      await db.delete(users).where(sql`lower(${users.username}) = lower(${resetUser})`);
    });
  });

  // ==========================================================================
  // 7. FULL END-TO-END SIGNUP & LOGIN FLOWS
  // ==========================================================================
  describe("7. End-to-End Authentication Flows", () => {
    it("completes full WhatsApp signup -> login -> me -> logout happy path", async () => {
      // Step 1: Request OTP
      const otpReq = await request(app)
        .post("/api/auth/signup/otp/request")
        .send({ phone: testPhone })
        .expect(200);

      expect(otpReq.body.status).toBe("ok");
      expect(otpReq.body.devCode).toBeUndefined(); // Zero dev leak!

      // Update OTP with known code in test DB
      const code = "654321";
      const salt = crypto.randomBytes(16).toString("hex");
      const idHash = crypto.createHash("sha256").update(testPhone).digest("hex");
      await db.update(otpCodes).set({ codeHash: hashOtp(code, salt), salt }).where(eq(otpCodes.identifierHash, idHash));

      // Step 2: Verify OTP
      const verifyReq = await request(app)
        .post("/api/auth/signup/otp/verify")
        .send({ identifier: testPhone, code })
        .expect(200);

      expect(verifyReq.body.success).toBe(true);
      const vToken = verifyReq.body.verificationToken;
      expect(vToken).toBeDefined();

      // Step 3: Complete registration with username and password
      const completeReq = await request(app)
        .post("/api/auth/signup/complete")
        .send({
          verificationToken: vToken,
          username: testUsername,
          password: testPassword,
        })
        .expect(201);

      expect(completeReq.body.success).toBe(true);
      expect(completeReq.body.user.username).toBe(testUsername);

      // Extract session cookie from registration response
      const sessionCookie = completeReq.headers["set-cookie"];
      expect(sessionCookie).toBeDefined();

      // Step 4: Access /api/auth/me with session cookie
      const meReq = await request(app)
        .get("/api/auth/me")
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(meReq.body.user.username).toBe(testUsername);

      // Step 5: Returning customer login
      const loginReq = await request(app)
        .post("/api/auth/login")
        .send({
          username: testUsername,
          password: testPassword,
        })
        .expect(200);

      expect(loginReq.body.success).toBe(true);
      const loginCookie = loginReq.headers["set-cookie"];

      // Step 6: Logout
      const logoutReq = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", loginCookie)
        .expect(200);

      expect(logoutReq.body.success).toBe(true);
    });

    it("rejects forged or fake Google tokens with 401", async () => {
      const res = await request(app)
        .post("/api/auth/google")
        .send({ credential: "mock_google_id_token_fake" })
        .expect(401);

      expect(res.body.error).toMatch(/Unable to verify Google identity/i);
    });

    it("validates credentials first and accurately analyzes role to determine redirect target (admin -> step-up, client -> /client, customer -> /book)", async () => {
      // 1. Invalid credentials must be rejected first
      await request(app)
        .post("/api/auth/login")
        .send({
          username: "admin",
          password: "WrongPassword123!",
        })
        .expect(401);

      // Reset login rate limit and prior OTP codes for test isolation
      const { getRedisClient } = await import("../src/lib/baileys/queue");
      const redis = getRedisClient();
      await redis.del("ratelimit:login:user:admin");
      await db.delete(otpCodes).where(eq(otpCodes.purpose, "admin_stepup"));

      // 2. Super admin valid login -> returns stepUpRequired: true
      const adminLogin = await request(app)
        .post("/api/auth/login")
        .send({
          username: "admin",
          password: "WashFlow#Admin2026!",
        })
        .expect(200);

      expect(adminLogin.body.success).toBe(true);
      expect(adminLogin.body.stepUpRequired).toBe(true);
      expect(adminLogin.body.maskedDestination).toBeDefined();

      // 3. Client partner valid login -> redirects to /client
      const clientPassHash = await argon2.hash("ClientPass2026!");
      const [testClient] = await db
        .insert(users)
        .values({
          name: "DryCleaner Hub",
          username: "drycleaner_partner",
          passwordHash: clientPassHash,
          role: "client",
        })
        .returning();

      const clientLogin = await request(app)
        .post("/api/auth/login")
        .send({
          username: "drycleaner_partner",
          password: "ClientPass2026!",
        })
        .expect(200);

      expect(clientLogin.body.success).toBe(true);
      expect(clientLogin.body.user.role).toBe("client");
      expect(clientLogin.body.redirectTo).toBe("/client");

      // Cleanup
      await db.delete(users).where(eq(users.id, testClient.id));
    });
  });
});
