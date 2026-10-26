import { customerMessaging } from "../../services/customer-messaging";

export interface WhatsAppMessagePayload {
  toPhone: string;
  messageText: string;
  otpCode?: string;
}

export async function sendWhatsAppMessage(payload: WhatsAppMessagePayload): Promise<{
  success: boolean;
  provider: "meta" | "twilio_sms" | "mock";
  messageId?: string;
  error?: string;
}> {
  const { toPhone, messageText, otpCode } = payload;

  if (otpCode) {
    const res = await customerMessaging.sendOtp({
      toPhoneE164: toPhone,
      otpCode,
    });
    return {
      success: res.success,
      provider: res.provider,
      messageId: res.providerMessageId,
      error: res.error,
    };
  }

  // Text message delivery using OTF Washflow identity
  const res = await customerMessaging.sendCustomerSupportText({
    recipientPhone: toPhone,
    messageText,
  });

  return {
    success: res.success,
    provider: res.provider,
    messageId: res.providerMessageId,
    error: res.error,
  };
}
