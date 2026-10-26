import { describe, it, expect } from "vitest";
import {
  validateLegitimateFullName,
  validateLegitimateUsername,
  validateLegitimatePhone,
  validateLegitimateEmail,
  validateLegitimatePassword,
  validateReferralCodeFormat,
  detectKenyanCarrier,
} from "../src/lib/validation";
import { verifyGoogleIdToken } from "../src/lib/google-auth";

describe("Input Format & Legitimacy Verification System", () => {
  describe("1. Full Name Validation", () => {
    it("accepts legitimate two-part or three-part names", () => {
      const result = validateLegitimateFullName("David Kimani");
      expect(result.valid).toBe(true);
      expect(result.cleanName).toBe("David Kimani");

      const threePart = validateLegitimateFullName("grace wanjiku njeri");
      expect(threePart.valid).toBe(true);
      expect(threePart.cleanName).toBe("Grace Wanjiku Njeri");
    });

    it("rejects single names without a surname", () => {
      const result = validateLegitimateFullName("David");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/both your first name and last name/i);
    });

    it("rejects names with numbers or illegal symbols", () => {
      const result1 = validateLegitimateFullName("David123 Kimani");
      expect(result1.valid).toBe(false);

      const result2 = validateLegitimateFullName("David @ Kimani");
      expect(result2.valid).toBe(false);
    });

    it("rejects names shorter than 3 characters", () => {
      const result = validateLegitimateFullName("D K");
      expect(result.valid).toBe(false);
    });
  });

  describe("2. Username Validation & Platform Keywords", () => {
    it("accepts valid alphanumeric usernames starting with a letter", () => {
      const res = validateLegitimateUsername("david_kimani");
      expect(res.valid).toBe(true);
      expect(res.cleanUsername).toBe("david_kimani");

      const res2 = validateLegitimateUsername("@wash_user24");
      expect(res2.valid).toBe(true);
      expect(res2.cleanUsername).toBe("wash_user24");
    });

    it("rejects usernames starting with numbers or underscores", () => {
      const res1 = validateLegitimateUsername("123david");
      expect(res1.valid).toBe(false);
      expect(res1.error).toMatch(/must start with a letter/i);

      const res2 = validateLegitimateUsername("_david");
      expect(res2.valid).toBe(false);
    });

    it("rejects reserved system keywords", () => {
      expect(validateLegitimateUsername("admin").valid).toBe(false);
      expect(validateLegitimateUsername("administrator").valid).toBe(false);
      expect(validateLegitimateUsername("washflow").valid).toBe(false);
      expect(validateLegitimateUsername("root").valid).toBe(false);
      expect(validateLegitimateUsername("support").valid).toBe(false);
    });

    it("rejects usernames that end with an underscore or have consecutive underscores", () => {
      expect(validateLegitimateUsername("david_").valid).toBe(false);
      expect(validateLegitimateUsername("david__kimani").valid).toBe(false);
    });
  });

  describe("3. Mobile Phone Number & Kenyan Carrier Legitimacy", () => {
    it("recognizes and normalizes Safaricom numbers", () => {
      const res = validateLegitimatePhone("0722123456");
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe("+254722123456");
      expect(res.carrier).toBe("Safaricom");

      const res2 = validateLegitimatePhone("+254 701 456 789");
      expect(res2.valid).toBe(true);
      expect(res2.carrier).toBe("Safaricom");
    });

    it("recognizes and normalizes Airtel numbers", () => {
      const res = validateLegitimatePhone("0733456789");
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe("+254733456789");
      expect(res.carrier).toBe("Airtel");
    });

    it("recognizes and normalizes Telkom numbers", () => {
      const res = validateLegitimatePhone("0770123456");
      expect(res.valid).toBe(true);
      expect(res.carrier).toBe("Telkom");
    });

    it("rejects dummy and test numbers", () => {
      expect(validateLegitimatePhone("0700000000").valid).toBe(false);
      expect(validateLegitimatePhone("+254700000000").valid).toBe(false);
      expect(validateLegitimatePhone("0712345678").valid).toBe(false);
      expect(validateLegitimatePhone("0711111111").valid).toBe(false);
    });

    it("rejects repetitive digit patterns", () => {
      expect(validateLegitimatePhone("0799999999").valid).toBe(false);
    });
  });

  describe("4. Email Legitimacy & Disposable Domain Blocking", () => {
    it("accepts genuine email domains", () => {
      expect(validateLegitimateEmail("david@gmail.com").valid).toBe(true);
      expect(validateLegitimateEmail("info@washflow.co.ke").valid).toBe(true);
      expect(validateLegitimateEmail("user.name+tag@company.org").valid).toBe(true);
    });

    it("rejects disposable / temporary email providers", () => {
      expect(validateLegitimateEmail("spammer@mailinator.com").valid).toBe(false);
      expect(validateLegitimateEmail("throwaway@tempmail.com").valid).toBe(false);
      expect(validateLegitimateEmail("fake@guerrillamail.com").valid).toBe(false);
      expect(validateLegitimateEmail("test@10minutemail.com").valid).toBe(false);
    });

    it("rejects malformed email formats", () => {
      expect(validateLegitimateEmail("notanemail").valid).toBe(false);
      expect(validateLegitimateEmail("missing@domain").valid).toBe(false);
      expect(validateLegitimateEmail("@nodomain.com").valid).toBe(false);
    });
  });

  describe("5. Password Strength Validation", () => {
    it("accepts strong passwords meeting all 5 criteria", () => {
      const res = validateLegitimatePassword("WashFlow#2026Secure!");
      expect(res.valid).toBe(true);
      expect(res.score).toBe(5);
      expect(res.checks.length).toBe(true);
      expect(res.checks.upper).toBe(true);
      expect(res.checks.lower).toBe(true);
      expect(res.checks.number).toBe(true);
      expect(res.checks.symbol).toBe(true);
    });

    it("rejects passwords lacking required character classes", () => {
      // Missing uppercase
      expect(validateLegitimatePassword("washflow#2026!").valid).toBe(false);
      // Missing numbers
      expect(validateLegitimatePassword("WashFlow#Secure!").valid).toBe(false);
      // Missing special symbols
      expect(validateLegitimatePassword("WashFlow2026Secure").valid).toBe(false);
      // Under 8 characters
      expect(validateLegitimatePassword("Wf#1").valid).toBe(false);
    });

    it("rejects common trivial passwords", () => {
      expect(validateLegitimatePassword("password").valid).toBe(false);
      expect(validateLegitimatePassword("12345678").valid).toBe(false);
      expect(validateLegitimatePassword("password123").valid).toBe(false);
    });
  });

  describe("6. Referral Code Format", () => {
    it("validates WashFlow referral code format", () => {
      expect(validateReferralCodeFormat("WF-DAVID718")).toBe(true);
      expect(validateReferralCodeFormat("wf-kimani123")).toBe(true);
      expect(validateReferralCodeFormat("INVALID")).toBe(false);
      expect(validateReferralCodeFormat("WF-1")).toBe(false);
    });
  });

  describe("7. Google Token Legitimacy", () => {
    it("rejects missing or empty Google tokens", async () => {
      const res = await verifyGoogleIdToken("");
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("safely handles invalid or fabricated tokens", async () => {
      const res = await verifyGoogleIdToken("fabricated.jwt.token");
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("rejects raw email strings passed as tokens", async () => {
      const res = await verifyGoogleIdToken("user@gmail.com");
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });
});
