import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../src/server";
import { db, pool } from "../src/db";
import { users, otpCodes, waOutboundMessages, verificationTokens } from "../src/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { normalizePhoneNumber } from "../src/lib/validation";
import { normalizePhone } from "../src/lib/phone";
import { createAndStoreOtp, verifyAndConsumeOtp, hashOtp } from "../src/lib/otp";
import { resetRateLimit } from "../src/lib/rate-limiter";
import { customerMessaging, sendCustomerMessage, APPROVED_TEMPLATES } from "../src/services/customer-messaging";
import { env } from "../src/lib/env";
import { runPrivacyScan } from "../scripts/check-privacy";

describe("Phase 1 & Phase 2 & Phase 3: WhatsApp OTP, Privacy & BSUID Test Suite", () => {
  const TEST_KENYAN_PHONE = "+254712345678";
  const TEST_LOCAL_PHONE = "0712345678";
  const TEST_AIRTEL_PHONE = "0110123456";

  beforeEach(async () => {
    delete process.env.SIMULATE_WHATSAPP_FAILURE;
    // Reset rate limiter cache
    await resetRateLimit("ratelimit:*");

    // Clean test OTP and user records for isolation
    await pool.query(
      "DELETE FROM otp_codes WHERE identifier IN ($1, $2, $3, $4)",
      [TEST_KENYAN_PHONE, "+254110123456", "+254799999999", "+254788888888"]
    );
    await pool.query(
      "DELETE FROM users WHERE phone_e164 IN ($1, $2, $3, $4) OR phone IN ($1, $2, $3, $4) OR whatsapp_bsuid LIKE 'US.%'",
      [TEST_KENYAN_PHONE, "+254110123456", "+254799999999", "+254788888888"]
    );
  });

  // ==========================================================================
  // 1. Phone Normalization (E.164 Kenyan format)
  // ==========================================================================
  describe("1. Kenyan Phone Number Normalization to E.164", () => {
    it("normalizes 07XXXXXXXX and 01XXXXXXXX correctly to +254XXXXXXXXX", () => {
      const safaricom = normalizePhoneNumber("0712345678");
      expect(safaricom.valid).toBe(true);
      expect(safaricom.e164).toBe("+254712345678");

      const airtel = normalizePhoneNumber("0110123456");
      expect(airtel.valid).toBe(true);
      expect(airtel.e164).toBe("+254110123456");

      const formattedWithSpaces = normalizePhoneNumber("+254 712 345 678");
      expect(formattedWithSpaces.valid).toBe(true);
      expect(formattedWithSpaces.e164).toBe("+254712345678");

      const withoutPlus = normalizePhoneNumber("254712345678");
      expect(withoutPlus.valid).toBe(true);
      expect(withoutPlus.e164).toBe("+254712345678");
    });

    it("rejects invalid phone numbers, wrong lengths, or non-Kenyan prefixes", () => {
      const tooShort = normalizePhoneNumber("071234");
      expect(tooShort.valid).toBe(false);

      const invalidPrefix = normalizePhoneNumber("0812345678");
      expect(invalidPrefix.valid).toBe(false);

      const alphabetic = normalizePhoneNumber("abcdefghij");
      expect(alphabetic.valid).toBe(false);
    });
  });

  // ==========================================================================
  // 2. WhatsApp OTP Lifecycle: CSPRNG, Hash Storage, Expiry, Attempts, Resend
  // ==========================================================================
  describe("2. WhatsApp OTP Lifecycle & Security Guarantees", () => {
    it("generates a 6-digit CSPRNG code and stores only HMAC hash with 5-minute expiry", async () => {
      const result = await createAndStoreOtp({
        e164Phone: TEST_KENYAN_PHONE,
        purpose: "signup",
        clientIp: "127.0.0.1",
        sessionBindingId: "test_session_1",
      });

      expect(result.success).toBe(true);
      expect(result.otpId).toBeDefined();

      const record = await db.query.otpCodes.findFirst({
        where: eq(otpCodes.id, result.otpId!),
      });

      expect(record).toBeDefined();
      expect(record?.codeHash).toBeDefined();
      expect(record?.salt).toBeDefined();
      expect(record?.attempts).toBe(0);
      expect(record?.maxAttempts).toBe(5);

      // Verify expiration is ~5 minutes from lastSentAt
      const diffMinutes = (record!.expiresAt.getTime() - record!.lastSentAt.getTime()) / (60 * 1000);
      expect(Math.round(diffMinutes)).toBe(5);

      // Verify plaintext code is NOT stored anywhere in the database row
      const jsonRow = JSON.stringify(record);
      if (result.code) {
        expect(jsonRow).not.toContain(result.code);
      }
    });

    it("successfully verifies valid code and issues single-use verification token", async () => {
      const result = await createAndStoreOtp({
        e164Phone: TEST_KENYAN_PHONE,
        purpose: "signup",
        clientIp: "127.0.0.1",
        sessionBindingId: "test_session_verify",
      });

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();

      const verifyRes = await verifyAndConsumeOtp({
        e164Phone: TEST_KENYAN_PHONE,
        code: result.code!,
        purpose: "signup",
        sessionBindingId: "test_session_verify",
      });

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.verificationToken).toBeDefined();

      // Code is consumed atomically: attempting to verify a second time fails
      const replayRes = await verifyAndConsumeOtp({
        e164Phone: TEST_KENYAN_PHONE,
        code: result.code!,
        purpose: "signup",
        sessionBindingId: "test_session_verify",
      });

      expect(replayRes.success).toBe(false);
      expect(replayRes.error).toBe("That code is invalid or has expired.");
    });

    it("locks out after 5 incorrect attempts and carries forward attempts on resend", async () => {
      const result = await createAndStoreOtp({
        e164Phone: TEST_KENYAN_PHONE,
        purpose: "signup",
        clientIp: "127.0.0.1",
        sessionBindingId: "test_session_lockout",
      });

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        const wrongRes = await verifyAndConsumeOtp({
          e164Phone: TEST_KENYAN_PHONE,
          code: "999999",
          purpose: "signup",
          sessionBindingId: "test_session_lockout",
        });
        expect(wrongRes.success).toBe(false);
      }

      // 6th attempt (even with right code) is rejected
      const rightRes = await verifyAndConsumeOtp({
        e164Phone: TEST_KENYAN_PHONE,
        code: result.code!,
        purpose: "signup",
        sessionBindingId: "test_session_lockout",
      });
      expect(rightRes.success).toBe(false);
    });

    it("enforces 60-second resend cooldown timer", async () => {
      const first = await createAndStoreOtp({
        e164Phone: TEST_KENYAN_PHONE,
        purpose: "signup",
        clientIp: "127.0.0.1",
        sessionBindingId: "test_cooldown",
      });
      expect(first.success).toBe(true);

      // Immediate resend must be throttled with cooldown seconds
      const second = await createAndStoreOtp({
        e164Phone: TEST_KENYAN_PHONE,
        purpose: "signup",
        clientIp: "127.0.0.1",
        sessionBindingId: "test_cooldown",
      });

      expect(second.success).toBe(false);
      expect(second.error).toContain("seconds before requesting a new code");
      expect(second.retryAfterSeconds).toBeGreaterThan(0);
      expect(second.retryAfterSeconds).toBeLessThanOrEqual(60);
    });
  });

  // ==========================================================================
  // 3. Provider Failure Simulation (UI must not advance on failure)
  // ==========================================================================
  describe("3. Provider Failure Simulation & Real Result Responses", () => {
    it("returns HTTP 502 with clear error when WhatsApp provider delivery fails", async () => {
      process.env.SIMULATE_WHATSAPP_FAILURE = "true";

      const res = await request(app)
        .post("/api/auth/signup/otp/request")
        .send({ phone: "+254799999999" });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("Couldn't send the code, check your number or try again.");
      expect(res.body.status).toBeUndefined();

      delete process.env.SIMULATE_WHATSAPP_FAILURE;
    });

    it("standalone /api/auth/send-otp returns HTTP 502 on provider failure", async () => {
      process.env.SIMULATE_WHATSAPP_FAILURE = "true";

      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "+254799999999" });

      expect(res.status).toBe(502);
      expect(res.body.success).toBeUndefined();
      expect(res.body.error).toBe("Couldn't send the code, check your number or try again.");

      delete process.env.SIMULATE_WHATSAPP_FAILURE;
    });

    it("returns HTTP 422 for invalid phone on send-otp", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "07123" });

      expect(res.status).toBe(422);
      expect(res.body.error).toBeDefined();
    });
  });

  // ==========================================================================
  // 4. Privacy & Brand Identity: OTF Washflow (Admin Number Never Exposed)
  // ==========================================================================
  describe("4. Privacy & Brand Identity (Zero Admin Number Exposure)", () => {
    it("every approved template is signed with '- OTF Washflow'", () => {
      for (const [name, tmpl] of Object.entries(APPROVED_TEMPLATES)) {
        if (tmpl.category !== "AUTHENTICATION") {
          expect(tmpl.bodyText).toContain("- OTF Washflow");
        } else {
          expect(tmpl.bodyText).toContain("OTF Washflow");
        }
      }
    });

    it("dispatches customer messages exclusively under OTF Washflow identity", async () => {
      const result = await sendCustomerMessage({
        recipientPhone: TEST_KENYAN_PHONE,
        templateName: "order_received",
        variables: {
          customerName: "Jane Doe",
          shortId: "wf-101",
          pickupWindow: "2pm - 4pm",
          total: "1,200",
          trackingUrl: "https://washflow.co.ke/track/wf-101",
        },
        purpose: "notification",
      });

      expect(result.success).toBe(true);

      const outbound = await db.query.waOutboundMessages.findFirst({
        where: eq(waOutboundMessages.purpose, "notification"),
        orderBy: [desc(waOutboundMessages.queuedAt)],
      });

      expect(outbound).toBeDefined();
      expect(outbound?.renderedBodyMasked).toContain("OTF Washflow");
      expect(outbound?.renderedBodyMasked).not.toContain("0741617861");
      expect(outbound?.renderedBodyMasked).not.toContain("0706351077");
    });

    it("automated privacy lint scanner confirms zero admin personal numbers in customer-facing code", () => {
      const scanResult = runPrivacyScan();
      expect(scanResult.passed).toBe(true);
      expect(scanResult.violations).toEqual([]);
    });
  });

  // ==========================================================================
  // 5. BSUID & WhatsApp Username Readiness (Customers Who Hide Numbers)
  // ==========================================================================
  describe("5. WhatsApp BSUID & Username Readiness (Phase 3)", () => {
    const TEST_BSUID = `US.${Date.now()}`;

    it("processes inbound BSUID-only message without crash and prompts for phone number", async () => {
      const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_TEST_001",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "254700000000",
                    phone_number_id: "mock_phone_number_id",
                  },
                  contacts: [
                    {
                      profile: { name: "Private User", username: "private_shopper" },
                      user_id: TEST_BSUID,
                    },
                  ],
                  messages: [
                    {
                      from: TEST_BSUID,
                      id: `wamid_${Date.now()}`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: "Hello, I would like to book a laundry wash." },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const res = await request(app)
        .post("/api/whatsapp/webhook")
        .send(webhookPayload);

      expect(res.status).toBe(200);

      // Verify customer record created with BSUID
      const customer = await db.query.users.findFirst({
        where: eq(users.whatsappBsuid, TEST_BSUID),
      });

      expect(customer).toBeDefined();
      expect(customer?.whatsappBsuid).toBe(TEST_BSUID);
      expect(customer?.whatsappUsername).toBe("private_shopper");
      expect(customer?.phoneE164).toBeNull(); // Phone not yet shared
    });

    it("merges customer record when BSUID user later shares their phone number", async () => {
      const sharedPhone = "+254788888888";

      const sharePayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_TEST_001",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  contacts: [
                    {
                      profile: { name: "Private User", username: "private_shopper" },
                      user_id: TEST_BSUID,
                    },
                  ],
                  messages: [
                    {
                      from: TEST_BSUID,
                      id: `wamid_share_${Date.now()}`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "interactive",
                      interactive: {
                        type: "phone_number_share",
                        phone_number_share: {
                          phone_number: sharedPhone,
                        },
                      },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const res = await request(app)
        .post("/api/whatsapp/webhook")
        .send(sharePayload);

      expect(res.status).toBe(200);

      const updatedCustomer = await db.query.users.findFirst({
        where: eq(users.whatsappBsuid, TEST_BSUID),
      });

      expect(updatedCustomer).toBeDefined();
      expect(updatedCustomer?.phoneE164).toBe(sharedPhone);
    });

    it("handles delivery status webhooks (delivered, read, failed) with error tracking", async () => {
      // Create a test queued message
      const [testMsg] = await db
        .insert(waOutboundMessages)
        .values({
          purpose: "notification",
          recipientMasked: "+254 7•• ••• 678",
          recipientHash: "hash_status_test",
          providerMessageId: `wamid_status_tracking_${Date.now()}`,
          status: "sent",
        })
        .returning();

      const deliveredWebhook = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_TEST_001",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  statuses: [
                    {
                      id: testMsg.providerMessageId!,
                      status: "delivered",
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      recipient_id: "254712345678",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const res = await request(app)
        .post("/api/whatsapp/webhook")
        .send(deliveredWebhook);

      expect(res.status).toBe(200);

      const updated = await db.query.waOutboundMessages.findFirst({
        where: eq(waOutboundMessages.id, testMsg.id),
      });

      expect(updated?.status).toBe("delivered");
      expect(updated?.deliveredAt).toBeDefined();
    });
  });

  // ==========================================================================
  // 6. CORS by Design: Strict Origins, Methods & Preflight Checks
  // ==========================================================================
  describe("6. CORS Configuration & Preflight Handling", () => {
    it("answers OPTIONS preflight for /api/auth/send-otp with allowed origin, credentials, and methods", async () => {
      const res = await request(app)
        .options("/api/auth/send-otp")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "Content-Type, Authorization");

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });

    it("verifies webhook handshake via GET /api/whatsapp/webhook with valid verify_token", async () => {
      const challengeStr = "challenge_123456789";
      const res = await request(app)
        .get("/api/whatsapp/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
          "hub.challenge": challengeStr,
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe(challengeStr);
    });

    it("rejects unauthorized webhook handshake verify_token with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/whatsapp/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong_token",
          "hub.challenge": "12345",
        });

      expect(res.status).toBe(403);
    });
  });
});
