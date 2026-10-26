import path from "path";
import fs from "fs";
import { db } from "../../db";
import { bookings, users, addresses, notifications } from "../../db/schema";
import { eq } from "drizzle-orm";
import { env } from "../env";
import { baileysService } from "./baileys-service";
import { sendWhatsAppMessage } from "../notifications/whatsapp";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  recipient: "customer" | "admin";
  enabled: boolean;
  template: string;
}

export type AutomationTriggerKey =
  | "OTP_VERIFICATION"
  | "BOOKING_CONFIRMED"
  | "NEW_BOOKING_CUSTOMER"
  | "NEW_BOOKING_ADMIN"
  | "STATUS_PICKED_UP"
  | "STATUS_WASHING"
  | "STATUS_READY"
  | "STATUS_OUT_FOR_DELIVERY"
  | "STATUS_DELIVERED"
  | "STATUS_CANCELLED";

export const DEFAULT_AUTOMATIONS: Record<AutomationTriggerKey, AutomationRule> = {
  OTP_VERIFICATION: {
    id: "OTP_VERIFICATION",
    name: "Security OTP Verification Code",
    description: "Automated WhatsApp message containing the 6-digit security code for signup and password resets.",
    recipient: "customer",
    enabled: true,
    template: `🧺 *WashFlow Verification Code: {{otpCode}}*

Enter this code to verify your phone number and complete your registration.
Valid for {{expiryMinutes}} minutes.

If you did not request this code, please ignore this message.`,
  },
  BOOKING_CONFIRMED: {
    id: "BOOKING_CONFIRMED",
    name: "Booking Confirmed",
    description: "Sent automatically to the customer when the admin confirms their booking request.",
    recipient: "customer",
    enabled: true,
    template: `✨ *WashFlow Booking Confirmed!*

Hello {{customerName}}, your laundry booking (#{{shortId}}) has been confirmed!

📅 *Pickup Window:* {{pickupWindow}}
💵 *Total Amount:* KES {{total}}
📍 *Pickup Location:* {{address}}

🚚 Our rider will be at your doorstep during your scheduled window.
🔍 Track your laundry live:
{{trackingUrl}}

Thank you for choosing WashFlow! 🧺`,
  },

  NEW_BOOKING_CUSTOMER: {
    id: "NEW_BOOKING_CUSTOMER",
    name: "New Booking Received (Customer)",
    description: "Sent to the customer right after they submit a new booking on the website.",
    recipient: "customer",
    enabled: true,
    template: `👋 *Hello {{customerName}}!*

We have received your laundry booking request (#{{shortId}}).
📅 *Requested Window:* {{pickupWindow}}
💵 *Estimated Total:* KES {{total}}

Our team is scheduling your pickup. We will confirm your order shortly!
Track your request anytime:
{{trackingUrl}}`,
  },

  NEW_BOOKING_ADMIN: {
    id: "NEW_BOOKING_ADMIN",
    name: "New Booking Alert (Admin)",
    description: "Sent to the admin WhatsApp number whenever a customer submits an order.",
    recipient: "admin",
    enabled: true,
    template: `🚨 *New WashFlow Booking Received!*

Order ID: #{{shortId}}
Customer: {{customerName}} ({{customerPhone}})
Amount: KES {{total}}
Pickup Window: {{pickupWindow}}
Address: {{address}}

Manage order in Admin Console:
{{adminUrl}}`,
  },

  STATUS_PICKED_UP: {
    id: "STATUS_PICKED_UP",
    name: "Laundry Picked Up",
    description: "Sent when the rider picks up the garments from the customer.",
    recipient: "customer",
    enabled: true,
    template: `🛵 *Laundry Picked Up!*

Hello {{customerName}}, our rider has collected your clothes (#{{shortId}}). 
They are now on the way to our eco-friendly washing hub.

Track progress:
{{trackingUrl}}`,
  },

  STATUS_WASHING: {
    id: "STATUS_WASHING",
    name: "In Wash & Care",
    description: "Sent when garments are in the washing and drying process.",
    recipient: "customer",
    enabled: true,
    template: `🫧 *Washing in Progress!*

Hello {{customerName}}, your clothes (#{{shortId}}) are currently being sorted, treated, and gently washed.

Track progress:
{{trackingUrl}}`,
  },

  STATUS_READY: {
    id: "STATUS_READY",
    name: "Clean & Packaged",
    description: "Sent when washing is complete and clothes are neatly folded.",
    recipient: "customer",
    enabled: true,
    template: `🧺 *Clean, Fresh & Ready!*

Hello {{customerName}}, your laundry (#{{shortId}}) is clean, crisply folded, and packaged ready for delivery.

Track progress:
{{trackingUrl}}`,
  },

  STATUS_OUT_FOR_DELIVERY: {
    id: "STATUS_OUT_FOR_DELIVERY",
    name: "Out for Delivery",
    description: "Sent when rider departs to deliver the clean clothes to customer.",
    recipient: "customer",
    enabled: true,
    template: `🚚 *Out for Delivery!*

Hello {{customerName}}, your fresh laundry (#{{shortId}}) is on the way to {{address}}. 
Please ensure someone is available to receive the delivery.

Track rider arrival:
{{trackingUrl}}`,
  },

  STATUS_DELIVERED: {
    id: "STATUS_DELIVERED",
    name: "Delivered & Feedback",
    description: "Sent after delivery is completed, prompting customer to review and tip.",
    recipient: "customer",
    enabled: true,
    template: `🌟 *Order Delivered!*

Hello {{customerName}}, your laundry (#{{shortId}}) has been delivered! 

We hope everything looks and smells wonderful.
⭐ Rate your wash experience & send a cleaner tip:
{{ratingUrl}}

Thank you for choosing WashFlow! 🧺✨`,
  },

  STATUS_CANCELLED: {
    id: "STATUS_CANCELLED",
    name: "Booking Cancelled",
    description: "Sent if an order is cancelled.",
    recipient: "customer",
    enabled: true,
    template: `⚠️ *Booking Cancelled*

Hello {{customerName}}, your booking (#{{shortId}}) has been cancelled.

If you have any questions or would like to reschedule, simply reply to this message.`,
  },
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const AUTOMATIONS_FILE = path.resolve(DATA_DIR, "whatsapp_automations.json");

/**
 * Loads current automation rules from file or initializes defaults.
 */
export function getAutomationsConfig(): Record<AutomationTriggerKey, AutomationRule> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(AUTOMATIONS_FILE)) {
      const data = fs.readFileSync(AUTOMATIONS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      // Merge with defaults to guarantee all keys exist
      return { ...DEFAULT_AUTOMATIONS, ...parsed };
    }
  } catch (err) {
    console.error("Failed to read automations config, falling back to defaults:", err);
  }
  return { ...DEFAULT_AUTOMATIONS };
}

/**
 * Saves updated automation rules.
 */
export function saveAutomationsConfig(
  configs: Partial<Record<AutomationTriggerKey, AutomationRule>>
): Record<AutomationTriggerKey, AutomationRule> {
  const current = getAutomationsConfig();
  const updated = { ...current, ...configs };

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(AUTOMATIONS_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write automations config:", err);
  }

  return updated;
}

/**
 * Replaces placeholders in template string.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  let rendered = template;
  for (const [key, val] of Object.entries(variables)) {
    const pattern = new RegExp(`{{${key}}}`, "g");
    rendered = rendered.replace(pattern, val !== undefined && val !== null ? String(val) : "");
  }
  return rendered;
}

/**
 * Triggers an automated WhatsApp message for a booking.
 */
export async function triggerBookingAutomation(
  bookingId: string,
  triggerKey: AutomationTriggerKey,
  options?: {
    customNote?: string;
  }
): Promise<{
  triggered: boolean;
  success?: boolean;
  messageId?: string;
  error?: string;
}> {
  const automations = getAutomationsConfig();
  const rule = automations[triggerKey];

  if (!rule || !rule.enabled) {
    return { triggered: false, error: `Automation rule for "${triggerKey}" is disabled.` };
  }

  try {
    // 1. Fetch booking with customer and address
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        customer: true,
        address: true,
      },
    });

    if (!booking) {
      return { triggered: false, error: `Booking not found: ${bookingId}` };
    }

    const customer = booking.customer;
    const address = booking.address;

    if (!customer?.phone && rule.recipient === "customer") {
      return { triggered: false, error: "Customer has no phone number." };
    }

    const recipientPhone =
      rule.recipient === "admin"
        ? env.ADMIN_NOTIFY_PHONE || env.ADMIN_PHONE
        : customer.phone!;

    // 2. Render Template
    const shortId = booking.id.slice(0, 8);
    const trackingUrl = `${env.NEXT_PUBLIC_APP_URL}/track/${booking.id}`;
    const ratingUrl = `${env.NEXT_PUBLIC_APP_URL}/rate/${booking.id}`;
    const adminUrl = `${env.NEXT_PUBLIC_APP_URL}/admin`;

    const messageText = renderTemplate(rule.template, {
      customerName: customer?.name || "Valued Customer",
      customerPhone: customer?.phone || "",
      bookingId: booking.id,
      shortId,
      total: booking.total.toLocaleString(),
      subtotal: booking.subtotal.toLocaleString(),
      pickupWindow: booking.pickupWindow,
      address: address?.addressText || "Specified Pickup Address",
      landmark: address?.landmark || "",
      trackingUrl,
      ratingUrl,
      adminUrl,
      customNote: options?.customNote || "",
    });

    // 3. Record PENDING notification
    const [notifRecord] = await db
      .insert(notifications)
      .values({
        type: `WA_AUTO_${triggerKey}`,
        bookingId: booking.id,
        channel: "whatsapp",
        status: "PENDING",
        attempts: 1,
        payload: {
          to: recipientPhone,
          triggerKey,
          recipientType: rule.recipient,
        },
      })
      .returning();

    // 4. Send message via Baileys WhatsApp client
    const sendRes = await baileysService.sendTextMessage(recipientPhone, messageText);

    // 5. Update notification record status
    if (notifRecord) {
      await db
        .update(notifications)
        .set({
          status: sendRes.success ? "SENT" : "FAILED",
          lastError: sendRes.error || null,
        })
        .where(eq(notifications.id, notifRecord.id));
    }

    return {
      triggered: true,
      success: sendRes.success,
      messageId: sendRes.messageId,
      error: sendRes.error,
    };
  } catch (err: any) {
    console.error(`[WashFlow Automations] Error triggering ${triggerKey} for ${bookingId}:`, err);
    return {
      triggered: false,
      error: err?.message || "Failed to execute booking automation",
    };
  }
}

/**
 * Triggers an automated OTP verification message via the WhatsApp automations engine.
 */
export async function triggerOtpAutomation(params: {
  toPhone: string;
  otpCode: string;
  expiryMinutes?: number;
}): Promise<{
  triggered: boolean;
  success: boolean;
  provider: "baileys" | "meta" | "twilio" | "mock";
  messageId?: string;
  error?: string;
}> {
  const { toPhone, otpCode, expiryMinutes = 5 } = params;
  const automations = getAutomationsConfig();
  const rule = automations["OTP_VERIFICATION"] || DEFAULT_AUTOMATIONS["OTP_VERIFICATION"];

  if (!rule || !rule.enabled) {
    return {
      triggered: false,
      success: false,
      provider: "mock",
      error: "OTP automation rule is disabled in settings.",
    };
  }

  const messageText = renderTemplate(rule.template, {
    otpCode,
    expiryMinutes,
  });

  // Dispatch via prioritized WhatsApp provider (Baileys -> Meta -> Twilio -> Mock)
  const result = await sendWhatsAppMessage({
    toPhone,
    messageText,
    otpCode,
  });

  // Record notification in DB for WhatsApp audit & dashboard log
  try {
    await db.insert(notifications).values({
      type: "WA_AUTO_OTP_VERIFICATION",
      channel: "whatsapp",
      status: result.success ? "SENT" : "FAILED",
      attempts: 1,
      lastError: result.error || null,
      payload: {
        to: toPhone,
        provider: result.provider,
        messageId: result.messageId,
      },
    });
  } catch (dbErr) {
    console.warn("Failed to log OTP notification:", dbErr);
  }

  return {
    triggered: true,
    success: result.success,
    provider: result.provider,
    messageId: result.messageId,
    error: result.error,
  };
}
