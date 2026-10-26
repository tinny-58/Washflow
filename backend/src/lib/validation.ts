import crypto from "crypto";
import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from "libphonenumber-js";
import { db } from "../db";
import { users } from "../db/schema";
import { sql } from "drizzle-orm";

// ============================================================================
// 1. RESERVED SYSTEM USERNAMES & OFFENSIVE TERMS
// ============================================================================
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "washflow",
  "washflow_official",
  "root",
  "support",
  "system",
  "moderator",
  "superuser",
  "help",
  "api",
  "official",
  "billing",
  "operations",
  "staff",
  "guest",
  "security",
  "customer",
  "client",
  "owner",
  "partner",
  "null",
  "undefined",
  "anonymous",
  "auth",
  "login",
  "signup",
  "register",
  "dashboard",
  "booking",
  "manager",
  "service",
  "status",
  "terms",
  "privacy",
  "about",
  "contact",
]);

// Top common breached passwords for instant offline rejection
export const TOP_BREACHED_PASSWORDS = new Set([
  "password",
  "password123",
  "password1234",
  "1234567890",
  "123456789",
  "12345678",
  "qwerty12345",
  "letmein1234",
  "washflow123",
  "admin123456",
  "welcome1234",
  "iloveyou123",
  "monkey12345",
  "dragon12345",
  "master12345",
]);

// ============================================================================
// 2. USERNAME VALIDATION & SUGGESTIONS
// ============================================================================
export interface UsernameValidationResult {
  valid: boolean;
  cleanUsername?: string;
  error?: string;
}

/**
 * Validates username strictly against project requirements:
 * - 3-20 characters
 * - Letters, numbers, underscore and dot only
 * - Must start with a letter (a-z)
 * - No consecutive special characters (__, .., ._, _.)
 * - Must not end with an underscore or dot
 * - Not a reserved system keyword
 */
export function validateUsername(username: string): UsernameValidationResult {
  if (!username || typeof username !== "string") {
    return { valid: false, error: "Username is required." };
  }

  // Unicode normalize NFKC and lowercase
  const clean = username.normalize("NFKC").trim().toLowerCase().replace(/^@/, "");

  if (clean.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters." };
  }

  if (clean.length > 20) {
    return { valid: false, error: "Username cannot exceed 20 characters." };
  }

  if (!/^[a-z]/.test(clean)) {
    return { valid: false, error: "Username must start with a letter (a-z)." };
  }

  if (!/^[a-z0-9_.]+$/.test(clean)) {
    return {
      valid: false,
      error: "Username may only contain letters, numbers, underscores, and dots.",
    };
  }

  if (clean.endsWith("_") || clean.endsWith(".")) {
    return {
      valid: false,
      error: "Username cannot end with an underscore or dot.",
    };
  }

  if (
    clean.includes("__") ||
    clean.includes("..") ||
    clean.includes("._") ||
    clean.includes("_.")
  ) {
    return {
      valid: false,
      error: "Username cannot contain consecutive special characters.",
    };
  }

  if (RESERVED_USERNAMES.has(clean)) {
    return {
      valid: false,
      error: `'${clean}' is a reserved system keyword. Please choose a different username.`,
    };
  }

  return { valid: true, cleanUsername: clean };
}

/**
 * Generates up to 3 simple, human-readable suggestions when a username is taken,
 * and verifies that each suggestion is actually available in the database before returning it.
 * E.g.: name + short number, name + underscore + letter, name + current year.
 */
export async function generateAvailableUsernameSuggestions(
  baseInput: string
): Promise<string[]> {
  const base = baseInput
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 14);

  const cleanBase = base.length >= 3 && /^[a-z]/.test(base) ? base : "user";
  const currentYear = new Date().getFullYear().toString().slice(-2); // e.g. "26"

  const candidatePool: string[] = [
    `${cleanBase}_${Math.floor(10 + Math.random() * 90)}`,
    `${cleanBase}${Math.floor(100 + Math.random() * 900)}`,
    `${cleanBase}.${currentYear}`,
    `${cleanBase}_ke`,
    `${cleanBase}254`,
    `${cleanBase}_w`,
  ];

  const verifiedAvailable: string[] = [];

  for (const candidate of candidatePool) {
    if (verifiedAvailable.length >= 3) break;

    // Validate format
    const formatCheck = validateUsername(candidate);
    if (!formatCheck.valid) continue;

    // Check database availability using case-insensitive comparison
    const exists = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${candidate})`)
      .limit(1);

    if (exists.length === 0 && !verifiedAvailable.includes(candidate)) {
      verifiedAvailable.push(candidate);
    }
  }

  return verifiedAvailable;
}

// ============================================================================
// 3. NIST SP 800-63B PASSWORD VALIDATION & HAVEIBEENPWNED BREACH CHECK
// ============================================================================
export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
  isBreached?: boolean;
}

/**
 * Checks password against HaveIBeenPwned k-Anonymity API.
 * Uses only first 5 chars of SHA-1 hash (zero plaintext or full hash transmitted).
 * Includes 2-second timeout and offline dictionary fallback.
 */
export async function checkPwnedPassword(password: string): Promise<boolean> {
  // 1. Instant check against local high-frequency breach dictionary
  if (TOP_BREACHED_PASSWORDS.has(password.toLowerCase())) {
    return true;
  }

  try {
    const sha1Hash = crypto
      .createHash("sha1")
      .update(password)
      .digest("hex")
      .toUpperCase();

    const prefix = sha1Hash.slice(0, 5);
    const suffix = sha1Hash.slice(5);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        signal: controller.signal,
        headers: {
          "Add-Padding": "true",
          "User-Agent": "Washflow-Auth-Security",
        },
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      return false; // Fail open if API is unreachable
    }

    const text = await response.text();
    const lines = text.split("\n");

    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix === suffix) {
        const count = parseInt(countStr || "0", 10);
        return count > 0;
      }
    }

    return false;
  } catch {
    // In event of network failure or timeout, fail open to avoid blocking legitimate users
    return false;
  }
}

/**
 * Validates password strictly adhering to NIST SP 800-63B:
 * - Minimum 10 characters, maximum 128
 * - Allows all Unicode characters, paste, and whitespace
 * - No arbitrary composition rules (no required mix of upper/lower/symbols)
 * - Never trims password
 * - Checks against breached password list
 */
export async function validatePasswordNist(
  password: string
): Promise<PasswordValidationResult> {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required." };
  }

  // Length check (do NOT trim)
  if (password.length < 10) {
    return {
      valid: false,
      error: "Password must be at least 10 characters long.",
    };
  }

  if (password.length > 128) {
    return {
      valid: false,
      error: "Password cannot exceed 128 characters.",
    };
  }

  // Breached password check
  const isBreached = await checkPwnedPassword(password);
  if (isBreached) {
    return {
      valid: false,
      isBreached: true,
      error:
        "This password has appeared in a known data breach. For your security, please choose a different password.",
    };
  }

  return { valid: true };
}

// ============================================================================
// 4. PHONE & EMAIL NORMALIZATION
// ============================================================================
export interface PhoneNormalizationResult {
  valid: boolean;
  e164?: string;
  formatted?: string;
  error?: string;
}

export function normalizePhoneNumber(
  rawPhone: string,
  defaultCountry: CountryCode = "KE"
): PhoneNormalizationResult {
  if (!rawPhone || typeof rawPhone !== "string") {
    return { valid: false, error: "Phone number is required." };
  }

  const clean = rawPhone.normalize("NFKC").trim();

  try {
    const parsed = parsePhoneNumber(clean, defaultCountry);
    if (!parsed || !parsed.isValid()) {
      return {
        valid: false,
        error: "Please enter a valid phone number (e.g., 0712 345 678 or +254 712 345 678).",
      };
    }

    const e164 = parsed.format("E.164");
    return {
      valid: true,
      e164,
      formatted: parsed.formatInternational(),
    };
  } catch {
    return {
      valid: false,
      error: "Unable to parse phone number format.",
    };
  }
}

export function validateEmailFormat(email: string): {
  valid: boolean;
  cleanEmail?: string;
  error?: string;
} {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email is required." };
  }

  const clean = email.normalize("NFKC").trim().toLowerCase();
  const emailRegex =
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

  if (!emailRegex.test(clean) || clean.length > 254) {
    return { valid: false, error: "Please enter a valid email address." };
  }

  return { valid: true, cleanEmail: clean };
}

// ============================================================================
// 5. BACKWARDS-COMPATIBILITY EXPORTS FOR LEGACY TEST SUITES
// ============================================================================
export type Carrier = "Safaricom" | "Airtel" | "Telkom" | "Other";

export function detectKenyanCarrier(e164Phone: string): Carrier {
  if (!e164Phone.startsWith("+254")) return "Other";
  const local = e164Phone.replace("+254", "0");
  if (
    /^(070|071|072|079)/.test(local) ||
    /^(0740|0741|0742|0743|0745|0746|0748)/.test(local) ||
    /^(0757|0758|0759|0768|0769)/.test(local) ||
    /^(0110|0111|0112|0113|0114|0115)/.test(local)
  ) {
    return "Safaricom";
  }
  if (/^(073|078)/.test(local) || /^(0750|0751|0752|0753|0754|0755|0756)/.test(local)) {
    return "Airtel";
  }
  if (/^077/.test(local)) return "Telkom";
  return "Other";
}

export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "guerrillamail.com",
  "yopmail.com",
  "dispostable.com",
  "throwawaymail.com",
]);

export function validateLegitimateFullName(name: string): { valid: boolean; cleanName?: string; error?: string } {
  if (!name || typeof name !== "string") return { valid: false, error: "Full name is required." };
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 3) return { valid: false, error: "Name must be at least 3 characters." };
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) return { valid: false, error: "Full name can only contain letters." };
  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length < 2) return { valid: false, error: "Please enter both your first name and last name." };
  if (parts.some((p) => p.length < 2)) return { valid: false, error: "Each name part must be at least 2 letters long." };
  const cleanName = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  return { valid: true, cleanName };
}

export function validateLegitimateUsername(username: string) {
  return validateUsername(username);
}

export function validateLegitimatePhone(rawPhone: string, defaultCountry: CountryCode = "KE") {
  const norm = normalizePhoneNumber(rawPhone, defaultCountry);
  if (!norm.valid || !norm.e164) return { valid: false, error: norm.error };
  const cleanDigits = norm.e164.replace("+254", "");
  if (
    cleanDigits === "700000000" ||
    cleanDigits === "712345678" ||
    cleanDigits === "799999999" ||
    cleanDigits === "711111111" ||
    cleanDigits === "111111111" ||
    /^(\d)\1+$/.test(cleanDigits) ||
    /^(\d)\1{6,}$/.test(cleanDigits.slice(1)) ||
    cleanDigits.endsWith("000000") ||
    cleanDigits.endsWith("999999") ||
    /^(.)\1{5,}/.test(cleanDigits)
  ) {
    return { valid: false, error: "Dummy or repetitive phone numbers are not permitted." };
  }
  const carrier = detectKenyanCarrier(norm.e164);
  return {
    valid: true,
    normalized: norm.e164,
    formatted: norm.formatted,
    carrier,
  };
}

export function validateLegitimateEmail(email: string) {
  const format = validateEmailFormat(email);
  if (!format.valid || !format.cleanEmail) return format;
  const domain = format.cleanEmail.split("@")[1];
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, error: "Disposable email addresses are not allowed." };
  }
  return format;
}

export function validateLegitimatePassword(password: string) {
  const checks = {
    length: (password?.length || 0) >= 8,
    upper: /[A-Z]/.test(password || ""),
    lower: /[a-z]/.test(password || ""),
    number: /[0-9]/.test(password || ""),
    symbol: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/.test(password || ""),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const isTrivial = TOP_BREACHED_PASSWORDS.has((password || "").toLowerCase());
  const valid = (password?.length || 0) >= 8 && score === 5 && !isTrivial;
  return { valid, score, checks };
}

export function validateReferralCodeFormat(code: string): boolean {
  if (!code) return false;
  return /^WF-[A-Z0-9]{4,10}$/.test(code.trim().toUpperCase());
}

