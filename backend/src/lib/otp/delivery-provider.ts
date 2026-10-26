import crypto from "crypto";
import { customerMessaging } from "../../services/customer-messaging";
import { normalizePhoneNumber } from "../validation";

export interface OtpDeliveryPayload {
  otpId: string;
  toPhoneE164: string;
  otpCode: string;
  expiryMinutes: number;
  purpose: "signup" | "reset_password" | "admin_stepup" | "phone_change";
}

export interface OtpDeliveryProvider {
  readonly name: string;
  isDestinationAvailable(toPhoneE164: string): Promise<{ exists: boolean; error?: string }>;
  sendOtp(payload: OtpDeliveryPayload): Promise<{ success: boolean; error?: string }>;
}

export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  const prefix = e164.startsWith("+") ? e164.slice(0, 4) : digits.slice(0, 3);
  const suffix = digits.slice(-3);
  return `${prefix} ••• ••• ${suffix}`;
}

export function hashPhone(e164: string): string {
  return crypto.createHash("sha256").update(e164.trim()).digest("hex");
}

export class MetaCloudApiProvider implements OtpDeliveryProvider {
  readonly name = "meta_cloud_api";

  async isDestinationAvailable(toPhoneE164: string): Promise<{ exists: boolean; error?: string }> {
    const norm = normalizePhoneNumber(toPhoneE164);
    if (!norm.valid || !norm.e164) {
      return {
        exists: false,
        error: norm.error || "Invalid Kenyan phone number.",
      };
    }
    return { exists: true };
  }

  async sendOtp(payload: OtpDeliveryPayload): Promise<{ success: boolean; error?: string }> {
    const res = await customerMessaging.sendOtp({
      toPhoneE164: payload.toPhoneE164,
      otpCode: payload.otpCode,
      expiryMinutes: payload.expiryMinutes,
      purpose: payload.purpose,
      otpId: payload.otpId,
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || "Couldn't send the code, check your number or try again.",
      };
    }

    return { success: true };
  }
}

// Global active provider instance: Meta WhatsApp Cloud API via dedicated OTF Washflow number
export const otpDeliveryProvider: OtpDeliveryProvider = new MetaCloudApiProvider();
