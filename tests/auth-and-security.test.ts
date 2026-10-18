import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { normalizePhone, formatPhoneForDisplay } from "../src/lib/phone";
import { sanitizeText, sanitizeObject } from "../src/lib/sanitization";
import {
  createSessionToken,
  verifySessionToken,
} from "../src/lib/session";
import { checkRateLimit, getRedis } from "../src/lib/rate-limiter";
import { pool } from "../src/db";

describe("Phase 2: Phone Normalization & Validation", () => {
  it("normalizes Kenyan 07xx numbers to E.164 (+254)", () => {
    const normalized = normalizePhone("0712345678");
    expect(normalized).toBe("+254712345678");
  });

  it("normalizes 2547xx without plus to E.164", () => {
    const normalized = normalizePhone("254712345678");
    expect(normalized).toBe("+254712345678");
  });

  it("normalizes Safaricom 011x numbers to E.164", () => {
    const normalized = normalizePhone("0110123456");
    expect(normalized).toBe("+254110123456");
  });

  it("rejects invalid or corrupted phone inputs", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("not-a-number")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("Phase 2: Text Sanitization", () => {
  it("strips script and html tags from free text input", () => {
    const dirty = "<script>alert('pwned')</script>Leave laundry by the gate";
    expect(sanitizeText(dirty)).toBe("Leave laundry by the gate");
  });

  it("strips malicious nested tags and attributes", () => {
    const dirty = '<a href="javascript:stealCookie()">Click me</a><img src=x onerror=alert(1)>';
    expect(sanitizeText(dirty)).toBe("Click me");
  });

  it("sanitizes nested object fields", () => {
    const dirtyObj = {
      address: "<b>Apartment 4B</b>",
      landmark: "Near <script>evil()</script>Shell Petrol Station",
      count: 4,
    };
    const cleaned = sanitizeObject(dirtyObj);
    expect(cleaned.address).toBe("Apartment 4B");
    expect(cleaned.landmark).toBe("Near Shell Petrol Station");
    expect(cleaned.count).toBe(4);
  });
});

describe("Phase 2: Cryptographic Session Management", () => {
  it("creates and verifies a valid customer session token", () => {
    const token = createSessionToken({
      userId: "11111111-1111-1111-1111-111111111111",
      name: "John Doe",
      phone: "+254712345678",
      role: "customer",
    });

    const payload = verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("11111111-1111-1111-1111-111111111111");
    expect(payload?.name).toBe("John Doe");
    expect(payload?.role).toBe("customer");
  });

  it("rejects a tampered session token", () => {
    const token = createSessionToken({
      userId: "11111111-1111-1111-1111-111111111111",
      name: "John Doe",
      role: "customer",
    });

    // Tamper with payload
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}tampered.${parts[2]}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects an expired session token", () => {
    // Generate token that expired 10 seconds ago
    const token = createSessionToken(
      {
        userId: "11111111-1111-1111-1111-111111111111",
        name: "Old Session",
        role: "admin",
      },
      -10
    );

    expect(verifySessionToken(token)).toBeNull();
  });
});

describe("Phase 2: Sliding Window Rate Limiting", () => {
  afterAll(async () => {
    const redis = await getRedis();
    if (redis) {
      await redis.quit();
    }
    await pool.end();
  });

  it("enforces sliding window limits and returns remaining count", async () => {
    const testKey = `test:rl:${Date.now()}`;
    const limit = 3;
    const windowSeconds = 10;

    const res1 = await checkRateLimit(testKey, limit, windowSeconds);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = await checkRateLimit(testKey, limit, windowSeconds);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = await checkRateLimit(testKey, limit, windowSeconds);
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);

    // 4th request exceeds limit
    const res4 = await checkRateLimit(testKey, limit, windowSeconds);
    expect(res4.success).toBe(false);
    expect(res4.remaining).toBe(0);
    expect(res4.resetSeconds).toBeGreaterThan(0);
  });
});
