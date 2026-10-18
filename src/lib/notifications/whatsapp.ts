import { env } from "../env";

export interface WhatsAppMessagePayload {
  toPhone: string;
  messageText: string;
}

export async function sendWhatsAppMessage(payload: WhatsAppMessagePayload): Promise<{
  success: boolean;
  provider: "meta" | "twilio" | "mock";
  messageId?: string;
  error?: string;
}> {
  const { toPhone, messageText } = payload;

  // In test or non-production with mock credentials, log cleanly
  if (
    env.WHATSAPP_CLOUD_TOKEN.startsWith("mock_") &&
    env.TWILIO_ACCOUNT_SID.startsWith("mock_")
  ) {
    console.log(`\n💬 [WhatsApp Mock Delivery] To: ${toPhone}`);
    console.log(`Content:\n${messageText}\n`);
    return {
      success: true,
      provider: "mock",
      messageId: `mock-wa-${Date.now()}`,
    };
  }

  // 1. Try Meta WhatsApp Cloud API
  if (!env.WHATSAPP_CLOUD_TOKEN.startsWith("mock_") && env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: toPhone.replace(/\+/g, ""),
            type: "text",
            text: { preview_url: false, body: messageText },
          }),
        }
      );

      const data = await response.json();
      if (response.ok && data.messages?.[0]?.id) {
        return {
          success: true,
          provider: "meta",
          messageId: data.messages[0].id,
        };
      }
      console.warn("Meta WhatsApp API error, attempting Twilio fallback:", data);
    } catch (err) {
      console.warn("Meta WhatsApp request failed, falling back to Twilio:", err);
    }
  }

  // 2. Twilio Fallback
  if (!env.TWILIO_ACCOUNT_SID.startsWith("mock_") && env.TWILIO_AUTH_TOKEN) {
    try {
      const authHeader = Buffer.from(
        `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
      ).toString("base64");

      const params = new URLSearchParams();
      params.append("From", env.TWILIO_FROM_NUMBER);
      params.append("To", `whatsapp:${toPhone}`);
      params.append("Body", messageText);

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }
      );

      const twilioData = await twilioRes.json();
      if (twilioRes.ok && twilioData.sid) {
        return {
          success: true,
          provider: "twilio",
          messageId: twilioData.sid,
        };
      }
      return {
        success: false,
        provider: "twilio",
        error: twilioData.message || "Twilio delivery error",
      };
    } catch (err) {
      return {
        success: false,
        provider: "twilio",
        error: String(err),
      };
    }
  }

  return {
    success: true,
    provider: "mock",
    messageId: `mock-wa-${Date.now()}`,
  };
}
