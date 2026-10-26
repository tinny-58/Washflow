import crypto from "crypto";
import { db } from "../../db";
import { waOutboundMessages } from "../../db/schema";
import { getOtpQueue, checkNumberOnWhatsApp } from "../baileys/queue";
import { baileysService } from "../baileys/baileys-service";
import { alertAdminWhatsAppDisconnected } from "../notifications/email";

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

export class BaileysProvider implements OtpDeliveryProvider {
  readonly name = "baileys";

  async isDestinationAvailable(toPhoneE164: string): Promise<{ exists: boolean; error?: string }> {
    if (baileysService.isConnected()) {
      return await baileysService.checkNumberOnWhatsApp(toPhoneE164);
    }
    // Fall back to Redis RPC if worker is in separate process
    const res = await checkNumberOnWhatsApp(toPhoneE164);
    if (!res.exists && res.error) {
      await alertAdminWhatsAppDisconnected("Customer registration check failed because WhatsApp Gateway is offline.");
    }
    return res;
  }

  async sendOtp(payload: OtpDeliveryPayload): Promise<{ success: boolean; error?: string }> {
    const { otpId, toPhoneE164, otpCode, purpose } = payload;
    const recipientMasked = maskPhone(toPhoneE164);
    const recipientHash = hashPhone(toPhoneE164);

    // Fail closed: Never enqueue OTP jobs or store queued records if WhatsApp socket is offline
    if (!baileysService.isConnected()) {
      await alertAdminWhatsAppDisconnected(
        `Outbound verification code for ${recipientMasked} blocked: WhatsApp Gateway is offline.`
      ).catch(() => {});
      return {
        success: false,
        error: "WhatsApp delivery service is temporarily unavailable. Please try again shortly.",
      };
    }

    try {
      const dbPurpose: "signup_otp" | "reset_otp" | "security_alert" =
        purpose === "signup" ? "signup_otp" : purpose === "reset_password" ? "reset_otp" : "security_alert";

      // 1. Create audit/tracking record in wa_outbound_messages (Zero plain OTP or message body stored)
      await db.insert(waOutboundMessages).values({
        otpId,
        purpose: dbPurpose,
        recipientMasked,
        recipientHash,
        status: "queued",
        queuedAt: new Date(),
        attempts: 1,
      });

      // 2. Enqueue job for dedicated Baileys worker process with deduplication key
      const queue = getOtpQueue();
      await queue.add(
        "send-otp",
        {
          otpId,
          toPhone: toPhoneE164,
          otpCode,
          purpose,
        },
        {
          jobId: otpId, // Prevents duplicate delivery jobs for the same OTP record
        }
      );

      return { success: true };
    } catch (err: any) {
      console.error("Failed to enqueue Baileys OTP delivery:", err);
      return { success: false, error: "Failed to queue delivery message." };
    }
  }
}

// Global active provider instance (No fake or console provider in application code)
export const otpDeliveryProvider: OtpDeliveryProvider = new BaileysProvider();
