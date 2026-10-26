// ============================================================================
// CLIENT-SIDE VALIDATION & LEGITIMACY UTILITIES
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
  "dashboard",
  "booking",
  "manager",
]);

/**
 * Validates username strictly against project requirements:
 * 3-20 chars, letters, numbers, underscore, dot only. Must start with letter.
 * No consecutive special characters. Must not end with dot/underscore.
 */
export function validateUsername(username: string): {
  valid: boolean;
  error?: string;
  cleanUsername?: string;
} {
  if (!username) {
    return { valid: false, error: "Username is required." };
  }

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
      error: `'${clean}' is a reserved system keyword.`,
    };
  }

  return { valid: true, cleanUsername: clean };
}

/**
 * Password validation per NIST SP 800-63B:
 * - Minimum 10 characters, maximum 128
 * - No arbitrary composition rules (allow paste, unicode, spaces)
 */
export function validatePasswordNist(password: string): {
  valid: boolean;
  error?: string;
} {
  if (!password) {
    return { valid: false, error: "Password is required." };
  }

  if (password.length < 10) {
    return { valid: false, error: "Password must be at least 10 characters long." };
  }

  if (password.length > 128) {
    return { valid: false, error: "Password cannot exceed 128 characters." };
  }

  return { valid: true };
}

/**
 * Normalizes Kenyan or international mobile number to E.164 (+254...)
 */
export function normalizePhoneClient(rawPhone: string): {
  valid: boolean;
  e164?: string;
  formatted?: string;
  error?: string;
} {
  if (!rawPhone) {
    return { valid: false, error: "Phone number is required." };
  }

  const clean = rawPhone.replace(/[\s\-()]/g, "");

  // Kenyan standard formatting
  if (/^0[17]\d{8}$/.test(clean)) {
    const e164 = `+254${clean.slice(1)}`;
    const formatted = `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
    return { valid: true, e164, formatted };
  }

  if (/^(254|\+254)[17]\d{8}$/.test(clean)) {
    const e164 = clean.startsWith("+") ? clean : `+${clean}`;
    return { valid: true, e164, formatted: e164 };
  }

  // Generic international fallback (E.164: + followed by 8-15 digits)
  if (/^\+[1-9]\d{7,14}$/.test(clean)) {
    return { valid: true, e164: clean, formatted: clean };
  }

  return {
    valid: false,
    error: "Please enter a valid mobile number (e.g., 0712 345 678 or +254 712 345 678).",
  };
}

export const normalizePhoneNumber = normalizePhoneClient;
