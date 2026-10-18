import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from "libphonenumber-js";

/**
 * Normalizes a phone number to standard E.164 format.
 * Defaults to Kenya ('KE') if no country code is present.
 */
export function normalizePhone(rawPhone: string, defaultCountry: CountryCode = "KE"): string | null {
  if (!rawPhone) return null;
  const cleaned = rawPhone.trim().replace(/[\s-()]/g, "");

  try {
    if (!isValidPhoneNumber(cleaned, defaultCountry)) {
      return null;
    }
    const parsed = parsePhoneNumber(cleaned, defaultCountry);
    if (!parsed || !parsed.isValid()) {
      return null;
    }
    return parsed.format("E.164");
  } catch {
    return null;
  }
}

/**
 * Formats a phone number for display (e.g. +254 712 345 678).
 */
export function formatPhoneForDisplay(phone: string): string {
  try {
    const parsed = parsePhoneNumber(phone);
    if (parsed) {
      return parsed.formatInternational();
    }
  } catch {
    // fallback
  }
  return phone;
}
