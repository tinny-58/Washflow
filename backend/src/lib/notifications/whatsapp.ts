import { baileysService } from "../baileys/baileys-service";
import { getOtpQueue } from "../baileys/queue";

export interface WhatsAppMessagePayload {
  toPhone: string;
  messageText: string;
  otpCode?: string;
}

export async function sendWhatsAppMessage(payload: WhatsAppMessagePayload): Promise<{
  success: boolean;
  provider: "baileys";
  messageId?: string;
  error?: string;
}> {
  const { toPhone, messageText, otpCode } = payload;

  if (otpCode) {
    try {
      const queue = getOtpQueue();
      const job = await queue.add("send-otp", {
        otpId: `wa_msg_${Date.now()}`,
        toPhone,
        otpCode,
        purpose: "signup",
      });
      return {
        success: true,
        provider: "baileys",
        messageId: job.id,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: "baileys",
        error: err.message,
      };
    }
  }

  // Text message delivery
  try {
    const res = await baileysService.sendTextMessage(toPhone, messageText);
    return {
      success: res.success,
      provider: "baileys",
      messageId: res.messageId,
      error: res.error,
    };
  } catch (err: any) {
    return {
      success: false,
      provider: "baileys",
      error: err.message || "Failed to dispatch WhatsApp message",
    };
  }
}
