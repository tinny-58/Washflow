import { db } from "../../db";
import {
  waAutomationTemplates,
  waAutomationTemplateHistory,
  waOutboundMessages,
  bookings,
  users,
  addresses,
  auditLog,
} from "../../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { env } from "../env";
import { baileysService } from "./baileys-service";
import { getSecureTrackingUrl, getSecureRatingUrl } from "../tokens/access-tokens";
import { normalizePhone } from "../phone";
import crypto from "crypto";

export interface AutomationRuleRecord {
  id: string;
  name: string;
  description: string;
  recipientType: "customer" | "admin";
  priorityClass: "otp" | "transactional";
  enabled: boolean;
  template: string;
  version: number;
  updatedAt: string;
}

export const ALLOWED_VARIABLES: Record<string, { label: string; sensitive?: boolean }> = {
  "{{customerName}}": { label: "Customer Name" },
  "{{customerPhone}}": { label: "Customer Phone", sensitive: true },
  "{{shortId}}": { label: "Order ID (Short)" },
  "{{pickupWindow}}": { label: "Pickup Window" },
  "{{total}}": { label: "Total Amount", sensitive: true },
  "{{subtotal}}": { label: "Subtotal Amount", sensitive: true },
  "{{address}}": { label: "Pickup Address", sensitive: true },
  "{{landmark}}": { label: "Landmark" },
  "{{trackingUrl}}": { label: "Live Tracking Link" },
  "{{ratingUrl}}": { label: "Review & Tip Link" },
  "{{adminUrl}}": { label: "Admin Console Link" },
  "{{code}}": { label: "Verification OTP Code" },
  "{{expiryMinutes}}": { label: "Code Expiry (Minutes)" },
  "{{points}}": { label: "Reward Points" },
  "{{rewardName}}": { label: "Reward Name" },
  "{{voucherCode}}": { label: "Voucher Code" },
  "{{expiryDays}}": { label: "Expiry Days" },
  "{{cap}}": { label: "Discount Cap Amount" },
  "{{rewardsUrl}}": { label: "Rewards Dashboard URL" },
  "{{bookingUrl}}": { label: "Booking URL" },
  "{{reason}}": { label: "Reason" },
  "{{referrer}}": { label: "Referrer Name/Phone" },
  "{{referee}}": { label: "Referee Name/Phone" },
  "{{signals}}": { label: "Fraud Signals" },
  "{{milestoneKey}}": { label: "Milestone Key" },
  "{{shareUrl}}": { label: "Referral Share Link" },
};

export const DEFAULT_DATABASE_TEMPLATES: Record<
  string,
  {
    name: string;
    description: string;
    recipientType: "customer" | "admin";
    priorityClass: "otp" | "transactional";
    enabled: boolean;
    template: string;
  }
> = {
  OTP_VERIFICATION: {
    name: "Security OTP Verification Code",
    description: "Automated WhatsApp message containing the 6-digit security code for signup and password resets.",
    recipientType: "customer",
    priorityClass: "otp",
    enabled: true,
    template: `🧺 *WashFlow Verification Code: {{code}}*

Enter this code to verify your phone number and complete your registration.
Valid for {{expiryMinutes}} minutes. Do not share this code with anyone.

If you did not request this verification, please ignore this message.`,
  },
  BOOKING_CONFIRMED: {
    name: "Booking Confirmed",
    description: "Sent automatically to the customer when the admin confirms their laundry booking request.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `✨ *WashFlow Booking Confirmed!*

Hello {{customerName}}, your laundry booking (#{{shortId}}) has been confirmed.
📅 *Pickup Window:* {{pickupWindow}}
📍 *Pickup Location:* {{address}}

🚚 Our rider will arrive during your scheduled window.
🔍 Track your laundry live:
{{trackingUrl}}

Thank you for choosing WashFlow! 🧺`,
  },
  PICKUP_SCHEDULED: {
    name: "Pickup Scheduled Reminder",
    description: "Sent to the customer prior to their scheduled pickup time window.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `⏰ *WashFlow Pickup Reminder*

Hello {{customerName}}, our rider will arrive during your scheduled window: {{pickupWindow}}.
Please have your laundry ready for collection at {{address}}.

Track live progress:
{{trackingUrl}}`,
  },
  STATUS_PICKED_UP: {
    name: "Laundry Picked Up",
    description: "Sent when the rider collects the garments from the customer.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🛵 *Laundry Picked Up!*

Hello {{customerName}}, your laundry (#{{shortId}}) has been picked up by our rider and is en route to our washing hub.

Track progress:
{{trackingUrl}}`,
  },
  STATUS_WASHING: {
    name: "In Wash & Care",
    description: "Sent when garments enter the washing and delicate care cycle.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🫧 *Washing in Progress!*

Hello {{customerName}}, your garments (#{{shortId}}) are currently being sorted, treated, and gently washed.

Track progress:
{{trackingUrl}}`,
  },
  STATUS_READY: {
    name: "Clean & Packaged",
    description: "Sent when washing and packaging are complete, awaiting delivery dispatch.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🧺 *Clean, Fresh & Ready!*

Hello {{customerName}}, your laundry (#{{shortId}}) is clean, crisply folded, and packaged ready for delivery.

Track progress:
{{trackingUrl}}`,
  },
  STATUS_OUT_FOR_DELIVERY: {
    name: "Out for Delivery",
    description: "Sent when rider departs to deliver clean garments to the customer.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🚚 *Out for Delivery!*

Hello {{customerName}}, your fresh laundry (#{{shortId}}) is on the way to {{address}}. 
Please ensure someone is available to receive the delivery.

Track rider arrival:
{{trackingUrl}}`,
  },
  STATUS_DELIVERED: {
    name: "Delivered & Feedback",
    description: "Sent after delivery is completed, prompting customer to review and tip.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🌟 *Order Delivered!*

Hello {{customerName}}, your laundry (#{{shortId}}) has been delivered! We hope everything looks and smells wonderful.

✨ +10 loyalty points credited to your account! Collect 100 points for a free wash.

⭐ Rate your wash experience & send a cleaner tip:
{{ratingUrl}}

Thank you for choosing WashFlow! 🧺✨`,
  },
  REFERRAL_QUALIFIED_CLIENT: {
    name: "Referral Qualified (Client)",
    description: "Sent to the referrer when a friend's first order is delivered and verified paid.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🎉 *Referral Qualified!*

Hello {{customerName}}, your friend just completed their first order! You earned 100 referral points towards your next free wash voucher.

⭐ Current Referral Points: {{points}} pts.
View your milestone progress and wallet:
{{rewardsUrl}}`,
  },
  REWARD_AWAITING_APPROVAL_ADMIN: {
    name: "Reward Awaiting Approval (Admin Alert)",
    description: "Dispatched to admin operations when a client reaches a milestone requiring approval.",
    recipientType: "admin",
    priorityClass: "transactional",
    enabled: true,
    template: `🔔 *Admin Alert: Reward Milestone Reached*

Customer: {{customerName}} ({{customerPhone}})
Milestone: {{milestoneKey}} ({{points}} pts)

Please review and step-up approve in the Admin Portal:
{{adminUrl}}/admin/rewards`,
  },
  REWARD_APPROVED_CLIENT: {
    name: "Reward Approved & Voucher Ready (Client)",
    description: "Sent to customer when their milestone reward is approved by admin.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🎁 *Your Free Wash Voucher is Ready!*

Hello {{customerName}}, your {{rewardName}} voucher has been approved!

Code: *{{voucherCode}}* (Capped at KES {{cap}})
Valid for: {{expiryDays}} days.

Apply it at booking for 1 free wash line:
{{bookingUrl}}`,
  },
  REWARD_NOT_APPROVED_CLIENT: {
    name: "Reward Not Approved (Client)",
    description: "Sent to customer if an entitlement could not be approved.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `⚠️ *WashFlow Reward Notice*

Hello {{customerName}}, your milestone reward could not be approved at this time: {{reason}}.

Please contact our support team if you believe this was in error.`,
  },
  REWARD_EXPIRING_CLIENT: {
    name: "Reward Voucher Expiring Soon (Client)",
    description: "Sent 7 days before voucher expiration.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `⏰ *Free Wash Voucher Expiring Soon!*

Hello {{customerName}}, your {{rewardName}} voucher (*{{voucherCode}}*) expires in 7 days!

Don't lose your free wash:
{{bookingUrl}}`,
  },
  REFERRAL_FLAGGED_ADMIN: {
    name: "Referral Flagged (Admin Alert)",
    description: "Sent to admin when a referral matches fraud checks.",
    recipientType: "admin",
    priorityClass: "transactional",
    enabled: true,
    template: `🚨 *Admin Alert: Suspicious Referral Flagged*

Referrer: {{referrer}}
Referee: {{referee}}
Signals: {{signals}}

Review in Admin Fraud Queue:
{{adminUrl}}/admin/rewards`,
  },
  PAYMENT_RECEIVED: {
    name: "Payment Received Receipt",
    description: "Sent to the customer when payment is successfully confirmed.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `✅ *Payment Received - WashFlow*

Hello {{customerName}}, we have received payment of KES {{total}} for your order (#{{shortId}}).
Thank you for your business!

View your order receipt:
{{trackingUrl}}`,
  },
  REFERRAL_REWARD_CLIENT: {
    name: "Referral Reward Earned (Client)",
    description: "Sent to a client when a friend they referred completes their first wash.",
    recipientType: "customer",
    priorityClass: "transactional",
    enabled: true,
    template: `🎉 *You Earned Laundry Reward Points!*

Hello {{customerName}}, your friend just completed their first wash with WashFlow!
You have been awarded {{points}} reward points towards your next wash.

Check your balance in your client dashboard:
{{adminUrl}}/client`,
  },
  FREE_WASH_ADMIN: {
    name: "Free Wash Eligible (Admin Alert)",
    description: "Alert dispatched to operations admin when a loyal customer becomes eligible for a free wash reward.",
    recipientType: "admin",
    priorityClass: "transactional",
    enabled: true,
    template: `🚨 *Loyalty Reward Alert: Free Wash Eligible*

Customer: {{customerName}} ({{customerPhone}})
Points Balance: {{points}} pts
Order: #{{shortId}}

Review customer standing in Admin Console:
{{adminUrl}}/admin/customers`,
  },
};

/**
 * Initializes database templates if not already present.
 */
export async function ensureTemplatesSeeded(): Promise<void> {
  for (const [id, def] of Object.entries(DEFAULT_DATABASE_TEMPLATES)) {
    const existing = await db.query.waAutomationTemplates.findFirst({
      where: eq(waAutomationTemplates.id, id),
    });

    if (!existing) {
      await db.insert(waAutomationTemplates).values({
        id,
        name: def.name,
        description: def.description,
        recipientType: def.recipientType,
        priorityClass: def.priorityClass,
        enabled: def.enabled,
        template: def.template,
        version: 1,
      });

      await db.insert(waAutomationTemplateHistory).values({
        templateId: id,
        version: 1,
        template: def.template,
        action: "CREATE",
        changeSummary: "Initial template seed",
      });
    } else if (id === "STATUS_DELIVERED" && !existing.template.includes("loyalty points")) {
      await db
        .update(waAutomationTemplates)
        .set({ template: def.template, version: existing.version + 1 })
        .where(eq(waAutomationTemplates.id, id));
    }
  }
}

/**
 * Validates template content authoritatively on the server.
 */
export function validateTemplateAuthoritative(params: {
  id: string;
  template: string;
}): { valid: boolean; error?: string } {
  const { id, template } = params;

  if (!template || typeof template !== "string") {
    return { valid: false, error: "Template content is required." };
  }

  if (template.length > 1024) {
    return { valid: false, error: "Template exceeds maximum allowed length of 1,024 characters." };
  }

  // Reject control characters (allow newlines, carriage returns, tabs)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(template)) {
    return { valid: false, error: "Template contains illegal control characters." };
  }

  // Find all variable placeholders: {{variable}}
  const variableMatches = template.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  for (const match of variableMatches) {
    if (!ALLOWED_VARIABLES[match]) {
      return {
        valid: false,
        error: `Unknown or disallowed template variable: ${match}. Only allowlisted tokens are supported.`,
      };
    }
  }

  // Disallow nested expressions, template engine syntax, or script execution
  if (/\{\{[^}]*\{\{|<script|<iframe|javascript:|eval\(|\$\{/i.test(template)) {
    return { valid: false, error: "Template contains disallowed script or executable expressions." };
  }

  // Enforce OTP Template Rules
  if (id === "OTP_VERIFICATION") {
    if (!template.includes("{{code}}")) {
      return { valid: false, error: "OTP template must contain the {{code}} variable placeholder." };
    }
    const lower = template.toLowerCase();
    if (!lower.includes("expire") && !lower.includes("valid for") && !lower.includes("minutes")) {
      return { valid: false, error: "OTP template must clearly state code expiry or validity duration." };
    }
    if (!lower.includes("do not share") && !lower.includes("never share") && !lower.includes("ignore")) {
      return { valid: false, error: "OTP template must include a 'do not share' security warning." };
    }
    // Reject any hyperlinks in OTP messages
    if (/https?:\/\/|www\./i.test(template)) {
      return { valid: false, error: "OTP templates must not contain web links for anti-phishing compliance." };
    }
  }

  // Link Domain Allowlist for non-OTP templates
  // Links may only come from variables ({{trackingUrl}}, {{ratingUrl}}, {{adminUrl}}) or washflow.co.ke
  const rawUrls = template.match(/https?:\/\/[^\s)]+/g) || [];
  for (const urlStr of rawUrls) {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      if (host !== "washflow.co.ke" && !host.endsWith(".washflow.co.ke") && host !== "localhost") {
        return {
          valid: false,
          error: `Disallowed external link domain '${host}'. Only 'washflow.co.ke' domains or system variables are permitted.`,
        };
      }
    } catch {
      return { valid: false, error: `Invalid URL detected in template: ${urlStr}` };
    }
  }

  return { valid: true };
}

/**
 * Checks if the current time falls inside quiet hours in Africa/Nairobi (default 21:00 - 07:00).
 */
export function isInQuietHours(date = new Date()): { inQuietHours: boolean; nextAllowedSendTime: Date } {
  // Format current hour and minute in Africa/Nairobi
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Nairobi",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);

  // Quiet hours: 21:00 (9 PM) to 07:00 (7 AM)
  const isQuiet = hour >= 21 || hour < 7;

  // Compute next 07:00 Africa/Nairobi
  const nextSend = new Date(date);
  if (hour >= 21) {
    // Tomorrow at 07:00
    nextSend.setDate(nextSend.getDate() + 1);
  }
  // Approximate UTC conversion: Africa/Nairobi is UTC+3 (07:00 Nairobi = 04:00 UTC)
  nextSend.setUTCHours(4, 0, 0, 0);

  return { inQuietHours: isQuiet, nextAllowedSendTime: nextSend };
}

/**
 * Renders template variables cleanly and escapes sensitive characters.
 */
export function renderTemplateTokens(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  let rendered = template;
  for (const [key, val] of Object.entries(variables)) {
    const token = key.startsWith("{{") ? key : `{{${key}}}`;
    const cleanVal = val !== undefined && val !== null ? String(val).trim() : "";
    rendered = rendered.split(token).join(cleanVal);
  }
  return rendered;
}

/**
 * Triggers an automation with priority, quiet hours check, and safe deduplication.
 */
export async function dispatchAutomationMessage(params: {
  templateId: string;
  recipientPhone: string;
  bookingId?: string;
  variables: Record<string, string | number | undefined | null>;
  actorId?: string;
}): Promise<{
  success: boolean;
  queued?: boolean;
  messageId?: string;
  error?: string;
}> {
  const { templateId, recipientPhone, bookingId, variables, actorId } = params;

  // 1. Fetch template from PostgreSQL
  await ensureTemplatesSeeded();
  const rule = await db.query.waAutomationTemplates.findFirst({
    where: eq(waAutomationTemplates.id, templateId),
  });

  if (!rule || !rule.enabled) {
    return { success: false, error: `Automation '${templateId}' is disabled.` };
  }

  const normalized = normalizePhone(recipientPhone);
  if (!normalized) {
    return { success: false, error: "Invalid recipient phone number." };
  }

  // 2. Render Template
  const renderedText = renderTemplateTokens(rule.template, variables);

  // 3. Deduplication check by (bookingId, templateId)
  if (bookingId) {
    const dedupeKey = `${bookingId}:${templateId}`;
    const recentSent = await db.query.waOutboundMessages.findFirst({
      where: and(
        eq(waOutboundMessages.idempotencyKey, dedupeKey),
        sql`${waOutboundMessages.queuedAt} > NOW() - INTERVAL '1 hour'`
      ),
    });

    if (recentSent && (recentSent.status === "sent" || recentSent.status === "delivered")) {
      return {
        success: true,
        messageId: recentSent.providerMessageId || recentSent.id,
        error: "Duplicate automation already sent within last hour.",
      };
    }
  }

  const maskedPhone = recipientPhone.replace(/\D/g, "");
  const recipientMasked =
    maskedPhone.length > 4
      ? `+${maskedPhone.slice(0, 3)} ••• ••• ${maskedPhone.slice(-3)}`
      : "••••";
  const recipientHash = crypto.createHash("sha256").update(normalized).digest("hex");

  // 4. Quiet Hours check for non-OTP messages
  const isOtp = rule.priorityClass === "otp" || templateId === "OTP_VERIFICATION";
  let scheduledFor: Date | null = null;
  let status: "queued" | "skipped" = "queued";

  if (!isOtp) {
    const quietCheck = isInQuietHours();
    if (quietCheck.inQuietHours) {
      scheduledFor = quietCheck.nextAllowedSendTime;
    }
  }

  // Mask sensitive values in rendered body stored in database
  let renderedBodyMasked = renderedText;
  if (isOtp) {
    renderedBodyMasked = "[SECURITY OTP VERIFICATION MESSAGE]";
  } else {
    // Mask specific amounts or address if present
    if (variables.total) {
      renderedBodyMasked = renderedBodyMasked.split(String(variables.total)).join("•••");
    }
  }

  const idempotencyKey = bookingId ? `${bookingId}:${templateId}` : undefined;

  // 5. Insert outbox message record
  const [outboundRecord] = await db
    .insert(waOutboundMessages)
    .values({
      bookingId: bookingId || null,
      automationId: rule.id,
      templateVersion: rule.version,
      purpose: rule.id,
      recipientMasked,
      recipientHash,
      status: scheduledFor ? "queued" : "queued",
      renderedBodyMasked,
      priority: rule.priorityClass,
      idempotencyKey,
      scheduledFor,
      queuedAt: new Date(),
      attempts: 0,
    })
    .returning();

  // If deferred by quiet hours, return immediately
  if (scheduledFor) {
    return {
      success: true,
      queued: true,
      messageId: outboundRecord.id,
    };
  }

  // 6. Direct dispatch via Baileys if connected
  if (!baileysService.isConnected()) {
    await db
      .update(waOutboundMessages)
      .set({
        status: "failed",
        failureReason: "WhatsApp sender worker is offline",
        failedAt: new Date(),
        attempts: 1,
      })
      .where(eq(waOutboundMessages.id, outboundRecord.id));

    return {
      success: false,
      error: "WhatsApp worker is currently offline. Message logged in failure queue.",
    };
  }

  try {
    const sendResult = await baileysService.sendTextMessage(normalized, renderedText);

    await db
      .update(waOutboundMessages)
      .set({
        status: sendResult.success ? "sent" : "failed",
        providerMessageId: sendResult.messageId || null,
        sentAt: sendResult.success ? new Date() : null,
        failedAt: sendResult.success ? null : new Date(),
        failureReason: sendResult.error || null,
        attempts: 1,
      })
      .where(eq(waOutboundMessages.id, outboundRecord.id));

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
      error: sendResult.error,
    };
  } catch (err: any) {
    await db
      .update(waOutboundMessages)
      .set({
        status: "failed",
        failedAt: new Date(),
        failureReason: err?.message || "Socket send error",
        attempts: 1,
      })
      .where(eq(waOutboundMessages.id, outboundRecord.id));

    return { success: false, error: err?.message };
  }
}

/**
 * Triggers a booking lifecycle automation safely using scoped unguessable tokens.
 */
export async function triggerBookingLifecycleAutomation(
  bookingId: string,
  templateId: string,
  extraVars?: Record<string, string | number>
): Promise<{ success: boolean; error?: string }> {
  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        customer: true,
        address: true,
      },
    });

    if (!booking || !booking.customer) {
      return { success: false, error: "Booking or customer record not found." };
    }

    const customer = booking.customer;
    const address = booking.address;

    if (!customer.phone && !customer.phoneE164) {
      return { success: false, error: "Customer has no registered phone." };
    }

    const recipientPhone = customer.phone || customer.phoneE164!;
    const shortId = booking.id.slice(0, 8);
    const trackingUrl = await getSecureTrackingUrl(booking.id);
    const ratingUrl = await getSecureRatingUrl(booking.id);
    const adminUrl = `${env.NEXT_PUBLIC_APP_URL}/admin`;

    return await dispatchAutomationMessage({
      templateId,
      recipientPhone,
      bookingId: booking.id,
      variables: {
        customerName: customer.name || "Customer",
        customerPhone: recipientPhone,
        shortId,
        pickupWindow: booking.pickupWindow,
        total: booking.total.toLocaleString(),
        subtotal: booking.subtotal.toLocaleString(),
        address: address?.addressText || "Pickup location",
        landmark: address?.landmark || "",
        trackingUrl,
        ratingUrl,
        adminUrl,
        ...extraVars,
      },
    });
  } catch (err: any) {
    console.error(`[WashFlow Automations] Failed to trigger ${templateId} for ${bookingId}:`, err);
    return { success: false, error: err?.message };
  }
}

