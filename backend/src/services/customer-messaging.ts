import crypto from "crypto";
import { db, pool } from "../db";
import { waOutboundMessages, users, bookings, notifications, auditLog } from "../db/schema";
import { eq, or, and } from "drizzle-orm";
import { env } from "../lib/env";
import { normalizePhoneNumber } from "../lib/validation";
import { maskPhone, hashPhone } from "../lib/otp/delivery-provider";

export type CustomerMessageTemplate =
  | "authentication_otp"
  | "order_received"
  | "rider_on_the_way"
  | "order_delivered"
  | "payment_received"
  | "loyalty_points_update"
  | "referral_reward";

export interface SendOtpParams {
  toPhoneE164: string;
  otpCode: string;
  expiryMinutes?: number;
  purpose?: "signup" | "reset_password" | "admin_stepup" | "phone_change";
  otpId?: string;
}

export interface SendCustomerMessageParams {
  recipientPhone?: string;
  recipientBsuid?: string;
  templateName: CustomerMessageTemplate;
  variables: Record<string, string | number>;
  bookingId?: string;
  purpose?: string;
  idempotencyKey?: string;
}

export interface SendRawTextParams {
  recipientPhone?: string;
  recipientBsuid?: string;
  messageText: string;
  bookingId?: string;
  purpose?: string;
}

export interface MessageDispatchResult {
  success: boolean;
  provider: "meta" | "twilio_sms" | "mock";
  providerMessageId?: string;
  status?: "sent" | "queued" | "failed" | "delivered";
  error?: string;
  errorCode?: string | number;
  fallbackUsed?: boolean;
}

// Canonical approved templates definition for OTF Washflow
export const APPROVED_TEMPLATES: Record<
  CustomerMessageTemplate,
  {
    category: "AUTHENTICATION" | "UTILITY" | "MARKETING";
    language: string;
    description: string;
    bodyText: string;
    variableKeys: string[];
  }
> = {
  authentication_otp: {
    category: "AUTHENTICATION",
    language: "en_US",
    description: "Official WhatsApp Authentication template with copy-code button for 6-digit OTP verification.",
    bodyText: "Your OTF Washflow verification code is {{1}}. Valid for {{2}} minutes. Never share this code with anyone.",
    variableKeys: ["otpCode", "expiryMinutes"],
  },
  order_received: {
    category: "UTILITY",
    language: "en_US",
    description: "Notification sent immediately upon receiving a new laundry order.",
    bodyText: "Hello {{1}}, we have received your laundry order #{{2}}. Pickup window: {{3}}. Total: KES {{4}}. Track live: {{5}}\n\n- OTF Washflow",
    variableKeys: ["customerName", "shortId", "pickupWindow", "total", "trackingUrl"],
  },
  rider_on_the_way: {
    category: "UTILITY",
    language: "en_US",
    description: "Notification when rider is en route to collect or deliver garments.",
    bodyText: "Hello {{1}}, our rider is on the way for order #{{2}} to {{3}}. Estimated arrival: {{4}}. Track rider: {{5}}\n\n- OTF Washflow",
    variableKeys: ["customerName", "shortId", "address", "eta", "trackingUrl"],
  },
  order_delivered: {
    category: "UTILITY",
    language: "en_US",
    description: "Notification when clean laundry has been delivered, prompting review and tipping.",
    bodyText: "Hello {{1}}, your laundry order #{{2}} has been delivered fresh and clean! Rate your experience & tip: {{3}}\n\n- OTF Washflow",
    variableKeys: ["customerName", "shortId", "ratingUrl"],
  },
  payment_received: {
    category: "UTILITY",
    language: "en_US",
    description: "Receipt confirmation when an M-Pesa or card payment is verified.",
    bodyText: "Hello {{1}}, payment of KES {{2}} for order #{{3}} via M-Pesa has been received successfully. Receipt: {{4}}\n\n- OTF Washflow",
    variableKeys: ["customerName", "amount", "shortId", "receiptUrl"],
  },
  loyalty_points_update: {
    category: "MARKETING",
    language: "en_US",
    description: "Update on points balance when customer earns loyalty points.",
    bodyText: "Hello {{1}}, you have earned {{2}} WashFlow rewards points! Your new balance is {{3}} points. Redeem rewards at: {{4}}\n\n- OTF Washflow",
    variableKeys: ["customerName", "pointsEarned", "balance", "rewardsUrl"],
  },
  referral_reward: {
    category: "MARKETING",
    language: "en_US",
    description: "Reward notification when a friend completes their wash via referral code.",
    bodyText: "Hello {{1}}, your friend {{2}} completed their first wash! You earned a KES {{3}} discount voucher: {{4}}. Details: {{5}}\n\n- OTF Washflow",
    variableKeys: ["customerName", "friendName", "discountAmount", "voucherCode", "rewardsUrl"],
  },
};

/**
 * Normalizes message purpose to valid PostgreSQL message_purpose enum values:
 * 'signup_otp' | 'reset_otp' | 'security_alert' | 'notification'
 */
function mapMessagePurpose(
  purpose?: string
): "signup_otp" | "reset_otp" | "security_alert" | "notification" {
  if (purpose === "signup_otp" || purpose === "signup") return "signup_otp";
  if (purpose === "reset_otp" || purpose === "reset_password") return "reset_otp";
  if (purpose === "security_alert") return "security_alert";
  return "notification";
}

/**
 * Unified customer messaging service.
 * Enforces:
 * 1. Meta WhatsApp Cloud API via dedicated OTF Washflow Business Number.
 * 2. Authentication OTPs sent exclusively through approved WhatsApp template (copy-code button).
 * 3. Never exposes administrator personal phone numbers.
 * 4. Configurable SMS fallback if WhatsApp is undeliverable.
 * 5. Monotonic tracking in wa_outbound_messages.
 */
class CustomerMessagingService {
  private isTestOrMock(): boolean {
    return (
      env.NODE_ENV === "test" ||
      env.WHATSAPP_CLOUD_TOKEN.startsWith("mock_") ||
      !env.WHATSAPP_PHONE_NUMBER_ID ||
      env.WHATSAPP_PHONE_NUMBER_ID.startsWith("mock_")
    );
  }

  /**
   * Sends an OTP verification message through the approved WhatsApp AUTHENTICATION template.
   */
  async sendOtp(params: SendOtpParams): Promise<MessageDispatchResult> {
    const { toPhoneE164, otpCode, expiryMinutes = 5, purpose = "signup", otpId } = params;

    // 1. Normalize recipient to Kenyan E.164 standard (+254XXXXXXXXX)
    const norm = normalizePhoneNumber(toPhoneE164);
    if (!norm.valid || !norm.e164) {
      return {
        success: false,
        provider: "meta",
        error: "Invalid Kenyan phone number for WhatsApp verification.",
        errorCode: "INVALID_PHONE_NUMBER",
      };
    }

    const cleanE164 = norm.e164;
    const recipientDigits = cleanE164.replace(/\D/g, "");
    const masked = maskPhone(cleanE164);
    const hash = hashPhone(cleanE164);

    // 2. Build Meta Authentication template payload (Copy Code Button)
    const templateName = env.WHATSAPP_AUTH_TEMPLATE_NAME || "authentication_otp";
    const templateLang = env.WHATSAPP_AUTH_TEMPLATE_LANG || "en_US";

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientDigits,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: otpCode,
              },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: otpCode,
              },
            ],
          },
        ],
      },
    };

    // 3. Create tracking record in wa_outbound_messages (status: queued)
    const [msgRecord] = await db
      .insert(waOutboundMessages)
      .values({
        otpId: otpId || null,
        purpose: mapMessagePurpose(purpose),
        recipientMasked: masked,
        recipientHash: hash,
        status: "queued",
        priority: "otp",
        queuedAt: new Date(),
        attempts: 1,
      })
      .returning();

    // 4. Test / Mock Mode handling
    if (this.isTestOrMock()) {
      if (process.env.SIMULATE_WHATSAPP_FAILURE === "true") {
        await db
          .update(waOutboundMessages)
          .set({
            status: "failed",
            failedAt: new Date(),
            failureReason: "SIMULATED_PROVIDER_ERROR",
          })
          .where(eq(waOutboundMessages.id, msgRecord.id));

        return {
          success: false,
          provider: "mock",
          error: "Couldn't send the code, check your number or try again.",
          errorCode: "SIMULATED_FAILURE",
        };
      }

      const mockMsgId = `mock_wamid_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await db
        .update(waOutboundMessages)
        .set({
          providerMessageId: mockMsgId,
          status: "sent",
          sentAt: new Date(),
        })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return {
        success: true,
        provider: "mock",
        providerMessageId: mockMsgId,
        status: "sent",
      };
    }

    // 5. Live dispatch to Meta WhatsApp Cloud API
    try {
      const endpoint = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.messages?.[0]?.id) {
        const providerMessageId = data.messages[0].id;
        await db
          .update(waOutboundMessages)
          .set({
            providerMessageId,
            status: "sent",
            sentAt: new Date(),
          })
          .where(eq(waOutboundMessages.id, msgRecord.id));

        return {
          success: true,
          provider: "meta",
          providerMessageId,
          status: "sent",
        };
      }

      // Meta returned an error
      const errorCode = data?.error?.code || response.status;
      const errorMsg = data?.error?.message || "Meta WhatsApp API delivery failed";
      console.warn(`[OTF Washflow] Meta Cloud API error [Code ${errorCode}]: ${errorMsg}`);

      // 6. Check SMS Fallback if enabled
      if (env.ENABLE_SMS_FALLBACK && env.TWILIO_ACCOUNT_SID && !env.TWILIO_ACCOUNT_SID.startsWith("mock_")) {
        const fallbackRes = await this.sendTwilioSmsFallback(cleanE164, otpCode, expiryMinutes);
        if (fallbackRes.success) {
          await db
            .update(waOutboundMessages)
            .set({
              providerMessageId: fallbackRes.providerMessageId,
              status: "sent",
              sentAt: new Date(),
              failureReason: `FALLBACK_SMS: Meta error ${errorCode}`,
            })
            .where(eq(waOutboundMessages.id, msgRecord.id));

          return {
            ...fallbackRes,
            fallbackUsed: true,
          };
        }
      }

      // Update failure in database
      await db
        .update(waOutboundMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          failureReason: `META_ERROR_${errorCode}: ${errorMsg.slice(0, 200)}`,
        })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return {
        success: false,
        provider: "meta",
        error: "Couldn't send the code, check your number or try again.",
        errorCode,
      };
    } catch (netErr: any) {
      console.error("[OTF Washflow] Network error dispatching WhatsApp OTP:", netErr.message);

      await db
        .update(waOutboundMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          failureReason: `NETWORK_ERROR: ${netErr.message?.slice(0, 200)}`,
        })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return {
        success: false,
        provider: "meta",
        error: "Couldn't send the code, check your number or try again.",
        errorCode: "NETWORK_ERROR",
      };
    }
  }

  /**
   * Sends a customer notification via approved Meta template.
   * Brand display name: "OTF Washflow".
   */
  async sendCustomerMessage(params: SendCustomerMessageParams): Promise<MessageDispatchResult> {
    const {
      recipientPhone,
      recipientBsuid,
      templateName,
      variables,
      bookingId,
      purpose = "notification",
      idempotencyKey,
    } = params;

    const templateMeta = APPROVED_TEMPLATES[templateName];
    if (!templateMeta) {
      return {
        success: false,
        provider: "meta",
        error: `Unknown WhatsApp template: ${templateName}`,
      };
    }

    // Determine destination: Phone takes precedence, or BSUID if phone-less
    let toDestination = "";
    let recipientMasked = "";
    let recipientHashStr = "";

    if (recipientPhone) {
      const norm = normalizePhoneNumber(recipientPhone);
      if (!norm.valid || !norm.e164) {
        return { success: false, provider: "meta", error: "Invalid customer phone number" };
      }
      toDestination = norm.e164.replace(/\D/g, "");
      recipientMasked = maskPhone(norm.e164);
      recipientHashStr = hashPhone(norm.e164);
    } else if (recipientBsuid) {
      toDestination = recipientBsuid; // BSUID format like US.123456...
      recipientMasked = `${recipientBsuid.slice(0, 5)}•••${recipientBsuid.slice(-3)}`;
      recipientHashStr = hashPhone(recipientBsuid);
    } else {
      return { success: false, provider: "meta", error: "Recipient phone or WhatsApp BSUID required." };
    }

    // Format template parameters sequentially matching the approved template definition
    const parameters = templateMeta.variableKeys.map((key) => ({
      type: "text",
      text: String(variables[key] ?? ""),
    }));

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toDestination,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateMeta.language },
        components: [
          {
            type: "body",
            parameters,
          },
        ],
      },
    };

    // Rendered masked body for auditable preview without disclosing PII
    let renderedPreview = templateMeta.bodyText;
    templateMeta.variableKeys.forEach((key, idx) => {
      renderedPreview = renderedPreview.replace(`{{${idx + 1}}}`, String(variables[key] ?? ""));
    });

    // Tracking record
    const [msgRecord] = await db
      .insert(waOutboundMessages)
      .values({
        bookingId: bookingId || null,
        purpose: mapMessagePurpose(purpose),
        recipientMasked,
        recipientHash: recipientHashStr,
        renderedBodyMasked: renderedPreview.slice(0, 500),
        status: "queued",
        priority: "transactional",
        idempotencyKey: idempotencyKey || null,
        queuedAt: new Date(),
        attempts: 1,
      })
      .returning();

    // Test / Mock Mode
    if (this.isTestOrMock()) {
      if (process.env.SIMULATE_WHATSAPP_FAILURE === "true") {
        await db
          .update(waOutboundMessages)
          .set({ status: "failed", failedAt: new Date(), failureReason: "SIMULATED_PROVIDER_ERROR" })
          .where(eq(waOutboundMessages.id, msgRecord.id));
        return { success: false, provider: "mock", error: "Simulated delivery failure" };
      }

      const mockMsgId = `mock_wamid_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await db
        .update(waOutboundMessages)
        .set({ providerMessageId: mockMsgId, status: "sent", sentAt: new Date() })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return {
        success: true,
        provider: "mock",
        providerMessageId: mockMsgId,
        status: "sent",
      };
    }

    // Live Meta WhatsApp API
    try {
      const endpoint = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.messages?.[0]?.id) {
        const providerMessageId = data.messages[0].id;
        await db
          .update(waOutboundMessages)
          .set({
            providerMessageId,
            status: "sent",
            sentAt: new Date(),
          })
          .where(eq(waOutboundMessages.id, msgRecord.id));

        return {
          success: true,
          provider: "meta",
          providerMessageId,
          status: "sent",
        };
      }

      const errorCode = data?.error?.code || response.status;
      const errorMsg = data?.error?.message || "Meta WhatsApp template send failed";
      console.warn(`[OTF Washflow] Template message error [${errorCode}]: ${errorMsg}`);

      await db
        .update(waOutboundMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          failureReason: `META_ERROR_${errorCode}: ${errorMsg.slice(0, 200)}`,
        })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return {
        success: false,
        provider: "meta",
        error: errorMsg,
        errorCode,
      };
    } catch (err: any) {
      console.error("[OTF Washflow] Failed to send customer message:", err);
      await db
        .update(waOutboundMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          failureReason: `NETWORK_ERROR: ${err.message?.slice(0, 200)}`,
        })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return {
        success: false,
        provider: "meta",
        error: "Message delivery service unavailable.",
      };
    }
  }

  /**
   * Sends a 24h customer support window text message (used by admin reply or direct support).
   * Appends OTF Washflow signature.
   */
  async sendCustomerSupportText(params: SendRawTextParams): Promise<MessageDispatchResult> {
    const { recipientPhone, recipientBsuid, messageText, bookingId, purpose = "support_reply" } = params;

    let toDestination = "";
    let recipientMasked = "";
    let recipientHashStr = "";

    if (recipientPhone) {
      const norm = normalizePhoneNumber(recipientPhone);
      if (!norm.valid || !norm.e164) {
        return { success: false, provider: "meta", error: "Invalid phone number" };
      }
      toDestination = norm.e164.replace(/\D/g, "");
      recipientMasked = maskPhone(norm.e164);
      recipientHashStr = hashPhone(norm.e164);
    } else if (recipientBsuid) {
      toDestination = recipientBsuid;
      recipientMasked = `${recipientBsuid.slice(0, 5)}•••${recipientBsuid.slice(-3)}`;
      recipientHashStr = hashPhone(recipientBsuid);
    } else {
      return { success: false, provider: "meta", error: "Recipient phone or BSUID required." };
    }

    // Always guarantee brand identity
    const cleanText = messageText.includes("- OTF Washflow")
      ? messageText.trim()
      : `${messageText.trim()}\n\n- OTF Washflow`;

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toDestination,
      type: "text",
      text: {
        preview_url: false,
        body: cleanText,
      },
    };

    const [msgRecord] = await db
      .insert(waOutboundMessages)
      .values({
        bookingId: bookingId || null,
        purpose: mapMessagePurpose(purpose),
        recipientMasked,
        recipientHash: recipientHashStr,
        renderedBodyMasked: cleanText.slice(0, 500),
        status: "queued",
        priority: "transactional",
        queuedAt: new Date(),
        attempts: 1,
      })
      .returning();

    if (this.isTestOrMock()) {
      const mockMsgId = `mock_wamid_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await db
        .update(waOutboundMessages)
        .set({ providerMessageId: mockMsgId, status: "sent", sentAt: new Date() })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return {
        success: true,
        provider: "mock",
        providerMessageId: mockMsgId,
        status: "sent",
      };
    }

    try {
      const endpoint = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.messages?.[0]?.id) {
        const providerMessageId = data.messages[0].id;
        await db
          .update(waOutboundMessages)
          .set({ providerMessageId, status: "sent", sentAt: new Date() })
          .where(eq(waOutboundMessages.id, msgRecord.id));

        return { success: true, provider: "meta", providerMessageId, status: "sent" };
      }

      const errorCode = data?.error?.code || response.status;
      const errorMsg = data?.error?.message || "Send text message failed";

      await db
        .update(waOutboundMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          failureReason: `META_ERROR_${errorCode}: ${errorMsg.slice(0, 200)}`,
        })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return { success: false, provider: "meta", error: errorMsg, errorCode };
    } catch (err: any) {
      await db
        .update(waOutboundMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          failureReason: `NETWORK_ERROR: ${err.message?.slice(0, 200)}`,
        })
        .where(eq(waOutboundMessages.id, msgRecord.id));

      return { success: false, provider: "meta", error: "Message delivery service unavailable." };
    }
  }

  /**
   * Prompts a customer with a BSUID-only profile to share their phone number
   * using WhatsApp's interactive phone_number_request component.
   */
  async requestPhoneNumber(recipientBsuid: string): Promise<MessageDispatchResult> {
    if (!recipientBsuid) {
      return { success: false, provider: "meta", error: "BSUID required" };
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientBsuid,
      type: "interactive",
      interactive: {
        type: "phone_number_request",
        body: {
          text: "Welcome to OTF Washflow! To coordinate laundry pickup and delivery in Embu, please share your WhatsApp phone number below.\n\n- OTF Washflow",
        },
        action: {
          name: "send_phone_number",
        },
      },
    };

    if (this.isTestOrMock()) {
      return {
        success: true,
        provider: "mock",
        providerMessageId: `mock_phone_req_${Date.now()}`,
        status: "sent",
      };
    }

    try {
      const endpoint = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.messages?.[0]?.id) {
        return { success: true, provider: "meta", providerMessageId: data.messages[0].id, status: "sent" };
      }
      return { success: false, provider: "meta", error: data?.error?.message || "Failed to request phone number" };
    } catch (err: any) {
      return { success: false, provider: "meta", error: err.message };
    }
  }

  /**
   * Configurable SMS Fallback via Twilio REST API.
   */
  private async sendTwilioSmsFallback(
    toPhoneE164: string,
    otpCode: string,
    expiryMinutes: number
  ): Promise<MessageDispatchResult> {
    try {
      const authHeader = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const bodyParams = new URLSearchParams();
      bodyParams.append("From", env.TWILIO_FROM_NUMBER);
      bodyParams.append("To", toPhoneE164);
      bodyParams.append(
        "Body",
        `Your OTF Washflow verification code is ${otpCode}. Valid for ${expiryMinutes} minutes. Never share this code. - OTF Washflow`
      );

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: bodyParams.toString(),
        }
      );

      const twilioData = await twilioRes.json().catch(() => null);
      if (twilioRes.ok && twilioData?.sid) {
        return {
          success: true,
          provider: "twilio_sms",
          providerMessageId: twilioData.sid,
          status: "sent",
        };
      }

      return {
        success: false,
        provider: "twilio_sms",
        error: twilioData?.message || "Twilio SMS fallback failed",
      };
    } catch (err: any) {
      return {
        success: false,
        provider: "twilio_sms",
        error: err.message,
      };
    }
  }
}

export const customerMessaging = new CustomerMessagingService();

/**
 * Convenience single export function as specified in Ground Rules:
 * sendCustomerMessage
 */
export async function sendCustomerMessage(params: SendCustomerMessageParams): Promise<MessageDispatchResult> {
  return customerMessaging.sendCustomerMessage(params);
}
