import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../src/db";
import {
  validateTemplateAuthoritative,
  isInQuietHours,
  renderTemplateTokens,
} from "../src/lib/baileys/automations-db";
import {
  generateSecureToken,
  createOrderAccessToken,
  verifyOrderAccessToken,
  revokeOrderAccessToken,
} from "../src/lib/tokens/access-tokens";

describe("Authoritative WhatsApp Template Security", () => {
  it("accepts valid templates using allowlisted system variables", () => {
    const valid = validateTemplateAuthoritative({
      id: "BOOKING_CONFIRMED",
      template:
        "Hello {{customerName}}, your booking #{{shortId}} is confirmed! Total: KES {{total}}. Track at {{trackingUrl}}",
    });
    expect(valid.valid).toBe(true);
  });

  it("rejects templates containing unauthorized variables", () => {
    const invalid = validateTemplateAuthoritative({
      id: "BOOKING_CONFIRMED",
      template: "Hello {{customerName}}, your private token is {{unauthorizedToken}}",
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain("disallowed template variable");
    expect(invalid.error).toContain("unauthorizedToken");
  });

  it("rejects malicious script tags or executable HTML injection in templates", () => {
    const malicious = validateTemplateAuthoritative({
      id: "BOOKING_CONFIRMED",
      template: "Booking #{{shortId}} confirmed! <script>window.location='https://attacker.com'</script>",
    });
    expect(malicious.valid).toBe(false);
    expect(malicious.error).toContain("disallowed script");
  });

  it("rejects arbitrary external URLs not on the domain allowlist", () => {
    const phishing = validateTemplateAuthoritative({
      id: "BOOKING_CONFIRMED",
      template: "Booking confirmed! Login here: https://evil-phishing-site.com/login",
    });
    expect(phishing.valid).toBe(false);
    expect(phishing.error).toContain("Disallowed external link domain");
  });

  it("permits official washflow.co.ke static links and system tracking variables", () => {
    const official = validateTemplateAuthoritative({
      id: "BOOKING_CONFIRMED",
      template: "Visit https://washflow.co.ke/prices or track at {{trackingUrl}}",
    });
    expect(official.valid).toBe(true);
  });

  it("rejects templates containing illegal control characters", () => {
    const result = validateTemplateAuthoritative({
      id: "BOOKING_CONFIRMED",
      template: "Booking confirmed!\u0000 Thank you.",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("control characters");
  });

  it("enforces strict OTP security: template MUST contain {{code}}, expiry, no links, and warning", () => {
    // Missing code
    const missingCode = validateTemplateAuthoritative({
      id: "OTP_VERIFICATION",
      template: "Your WashFlow verification is on the way (valid 10 mins). Do not share.",
    });
    expect(missingCode.valid).toBe(false);
    expect(missingCode.error).toContain("must contain the {{code}} variable");

    // Missing expiry
    const missingExpiry = validateTemplateAuthoritative({
      id: "OTP_VERIFICATION",
      template: "Your WashFlow code is {{code}}. Do not share with anyone.",
    });
    expect(missingExpiry.valid).toBe(false);
    expect(missingExpiry.error).toContain("expiry");

    // Missing 'do not share' warning
    const missingWarning = validateTemplateAuthoritative({
      id: "OTP_VERIFICATION",
      template: "Your WashFlow code is {{code}} (valid 10 minutes). Enjoy!",
    });
    expect(missingWarning.valid).toBe(false);
    expect(missingWarning.error).toContain("do not share");

    // Contains link
    const otpWithLink = validateTemplateAuthoritative({
      id: "OTP_VERIFICATION",
      template: "Your WashFlow code is {{code}} (valid for 10 minutes). Never share this code. Click https://washflow.co.ke",
    });
    expect(otpWithLink.valid).toBe(false);
    expect(otpWithLink.error).toContain("must not contain web links");

    // Valid OTP template passes
    const validOtp = validateTemplateAuthoritative({
      id: "OTP_VERIFICATION",
      template: "Your WashFlow verification code is {{code}} (valid for 10 minutes). Do not share this code with anyone.",
    });
    expect(validOtp.valid).toBe(true);
  });

  it("renders variables as tokens cleanly", () => {
    const rendered = renderTemplateTokens(
      "Hello {{customerName}}! Total: KES {{total}}",
      {
        customerName: "Grace Wanjiku",
        total: "1,200",
      }
    );
    expect(rendered).toBe("Hello Grace Wanjiku! Total: KES 1,200");
  });
});

describe("128-Bit Unguessable Scoped Access Tokens", () => {
  let existingBookingId: string | null = null;

  beforeAll(async () => {
    const b = await db.query.bookings.findFirst();
    if (b) {
      existingBookingId = b.id;
    }
  });

  it("generates tokens with at least 128 bits of entropy (192-bit CSPRNG base64url)", () => {
    const token = generateSecureToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThanOrEqual(24);
    // 24 bytes in base64url = 32 chars = 192 bits of entropy (>= 128 bits)
    expect(token.length).toBe(32);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });

  it("verifies valid token and returns associated booking ID", async () => {
    if (!existingBookingId) {
      console.warn("Skipping DB token verification test: no bookings in DB");
      return;
    }

    const token = await createOrderAccessToken({
      bookingId: existingBookingId,
      purpose: "track",
      expiresInDays: 1,
    });

    const verification = await verifyOrderAccessToken(token, "track");
    expect(verification.valid).toBe(true);
    expect(verification.bookingId).toBe(existingBookingId);
  });

  it("enforces purpose scoping: track token cannot be used for rating", async () => {
    if (!existingBookingId) return;

    const token = await createOrderAccessToken({
      bookingId: existingBookingId,
      purpose: "track",
      expiresInDays: 1,
    });

    const verification = await verifyOrderAccessToken(token, "rate");
    expect(verification.valid).toBe(false);
    expect(verification.error).toContain("mismatch");
  });

  it("immediately revokes token on demand (single-use rating guarantee)", async () => {
    if (!existingBookingId) return;

    const token = await createOrderAccessToken({
      bookingId: existingBookingId,
      purpose: "rate",
      expiresInDays: 1,
    });

    const firstCheck = await verifyOrderAccessToken(token, "rate");
    expect(firstCheck.valid).toBe(true);

    await revokeOrderAccessToken(token);

    const secondCheck = await verifyOrderAccessToken(token, "rate");
    expect(secondCheck.valid).toBe(false);
    expect(secondCheck.error).toContain("revoked");
  });

  it("safely handles non-existent or brute-forced tokens without leaking details", async () => {
    const fakeToken = "a".repeat(32);
    const verification = await verifyOrderAccessToken(fakeToken, "track");

    expect(verification.valid).toBe(false);
    expect(verification.bookingId).toBeUndefined();
  });
});

describe("Quiet Hours & Delivery Policy (Africa/Nairobi)", () => {
  it("correctly identifies quiet hours window (21:00 to 07:00 Africa/Nairobi)", () => {
    // 23:00 Nairobi time = 20:00 UTC
    const lateNightDate = new Date("2026-10-24T20:00:00Z");
    const quietStatus = isInQuietHours(lateNightDate);
    expect(quietStatus.inQuietHours).toBe(true);
    expect(quietStatus.nextAllowedSendTime).toBeInstanceOf(Date);

    // 14:00 Nairobi time = 11:00 UTC
    const dayDate = new Date("2026-10-24T11:00:00Z");
    const dayStatus = isInQuietHours(dayDate);
    expect(dayStatus.inQuietHours).toBe(false);
  });
});
