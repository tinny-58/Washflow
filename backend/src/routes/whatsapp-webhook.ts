import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db, pool } from "../db";
import { users, waOutboundMessages, auditLog } from "../db/schema";
import { eq, or, sql } from "drizzle-orm";
import { env } from "../lib/env";
import { normalizePhoneNumber } from "../lib/validation";
import { customerMessaging } from "../services/customer-messaging";

const router = Router();

/**
 * 1. Webhook Verification Handshake (GET /api/whatsapp/webhook)
 * Meta verifies the endpoint by sending hub.mode, hub.verify_token, and hub.challenge.
 */
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ [OTF Washflow] WhatsApp Webhook handshake verified successfully.");
    return res.status(200).send(challenge);
  }

  console.warn("❌ [OTF Washflow] WhatsApp Webhook handshake verification failed. Token mismatch.");
  return res.status(403).json({ error: "Forbidden. Invalid verification token." });
});

/**
 * Helper: Validates X-Hub-Signature-256 using WHATSAPP_APP_SECRET
 */
function verifyMetaSignature(req: Request): boolean {
  // In test or development without app secret configured, allow bypass
  if (
    env.NODE_ENV === "test" ||
    !env.WHATSAPP_APP_SECRET ||
    env.WHATSAPP_APP_SECRET.startsWith("mock_")
  ) {
    return true;
  }

  const signatureHeader = req.headers["x-hub-signature-256"] as string;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    return false;
  }

  const expectedSig = crypto
    .createHmac("sha256", env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  const providedSig = signatureHeader.slice(7);

  try {
    const expectedBuf = Buffer.from(expectedSig, "hex");
    const providedBuf = Buffer.from(providedSig, "hex");
    return (
      expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf)
    );
  } catch {
    return false;
  }
}

/**
 * 2. Webhook Event Notifications (POST /api/whatsapp/webhook)
 * Receives delivery status updates (sent, delivered, read, failed)
 * and inbound customer messages (BSUID & phone matching/merging).
 */
router.post("/webhook", async (req: Request, res: Response) => {
  if (!verifyMetaSignature(req)) {
    console.warn("❌ [OTF Washflow] Webhook signature verification failed.");
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const body = req.body;
    if (body?.object !== "whatsapp_business_account" || !Array.isArray(body?.entry)) {
      return;
    }

    for (const entry of body.entry) {
      if (!Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        const val = change.value;
        if (!val || val.messaging_product !== "whatsapp") continue;

        // ====================================================================
        // A. Handle Outbound Message Status Updates (Monotonic Receipts)
        // ====================================================================
        if (Array.isArray(val.statuses)) {
          for (const statusItem of val.statuses) {
            const providerMsgId = statusItem.id;
            const newStatus = statusItem.status; // sent | delivered | read | failed
            if (!providerMsgId || !newStatus) continue;

            const existingMsg = await db.query.waOutboundMessages.findFirst({
              where: eq(waOutboundMessages.providerMessageId, providerMsgId),
            });

            if (!existingMsg) continue;

            if (newStatus === "delivered") {
              await db
                .update(waOutboundMessages)
                .set({
                  status: "delivered",
                  deliveredAt: new Date(),
                })
                .where(eq(waOutboundMessages.id, existingMsg.id));
            } else if (newStatus === "read") {
              await db
                .update(waOutboundMessages)
                .set({
                  status: "read",
                  readAt: new Date(),
                  deliveredAt: existingMsg.deliveredAt || new Date(),
                })
                .where(eq(waOutboundMessages.id, existingMsg.id));
            } else if (newStatus === "failed") {
              const err = statusItem.errors?.[0];
              const errorCode = err?.code || "UNKNOWN";
              const errorReason = err?.title || err?.message || "Delivery failed";

              await db
                .update(waOutboundMessages)
                .set({
                  status: "failed",
                  failedAt: new Date(),
                  failureReason: `ERROR_${errorCode}: ${errorReason.slice(0, 200)}`,
                })
                .where(eq(waOutboundMessages.id, existingMsg.id));

              console.warn(
                `[OTF Washflow] WhatsApp delivery failure for msg ${providerMsgId} [${errorCode}]: ${errorReason}`
              );
            }
          }
        }

        // ====================================================================
        // B. Handle Inbound Customer Messages & BSUID/Username Matching
        // ====================================================================
        if (Array.isArray(val.messages)) {
          const contacts = Array.isArray(val.contacts) ? val.contacts : [];

          for (const msg of val.messages) {
            const rawSender = msg.from; // Could be E.164 without '+' or BSUID (e.g. US.12345...)
            const isBsuid = typeof rawSender === "string" && rawSender.startsWith("US.");
            const senderBsuid = isBsuid ? rawSender : contacts[0]?.user_id || null;
            let senderPhone = !isBsuid ? normalizePhoneNumber(rawSender).e164 || null : null;
            const contactProfile = contacts.find((c: any) => c.wa_id === rawSender || c.user_id === senderBsuid);
            const customerName = contactProfile?.profile?.name || "WhatsApp Customer";
            const whatsappUsername = contactProfile?.profile?.username || null;

            // Check if customer shared their phone number via interactive component
            if (msg.type === "interactive" && msg.interactive?.type === "phone_number_share") {
              const shared = msg.interactive?.phone_number_share?.phone_number;
              if (shared) {
                const normShared = normalizePhoneNumber(shared);
                if (normShared.valid && normShared.e164) {
                  senderPhone = normShared.e164;
                }
              }
            }

            // Phase 3 Matching logic:
            // 1. Match by BSUID first
            // 2. Match by Phone number second
            let matchedCustomer: any = null;

            if (senderBsuid) {
              matchedCustomer = await db.query.users.findFirst({
                where: eq(users.whatsappBsuid, senderBsuid),
              });
            }

            let phoneMatchedCustomer: any = null;
            if (senderPhone) {
              phoneMatchedCustomer = await db.query.users.findFirst({
                where: or(eq(users.phoneE164, senderPhone), eq(users.phone, senderPhone)),
              });
            }

            // 3. Merging: If BSUID matches one record and phone matches a different record, merge them!
            if (
              matchedCustomer &&
              phoneMatchedCustomer &&
              matchedCustomer.id !== phoneMatchedCustomer.id
            ) {
              console.log(
                `[OTF Washflow] Merging customer records: Primary ${phoneMatchedCustomer.id} with BSUID profile ${matchedCustomer.id}`
              );

              // 1. Remove BSUID from temporary profile first to avoid unique constraint violation
              await pool.query(
                "UPDATE users SET whatsapp_bsuid = NULL, is_blocked = true, phone_blind_index = NULL WHERE id = $1",
                [matchedCustomer.id]
              );

              // 2. Update primary customer with BSUID and username
              await db
                .update(users)
                .set({
                  whatsappBsuid: senderBsuid,
                  whatsappUsername: whatsappUsername || phoneMatchedCustomer.whatsappUsername,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, phoneMatchedCustomer.id));

              // 3. Point bookings from temporary BSUID profile to primary
              await pool.query(
                "UPDATE bookings SET customer_id = $1 WHERE customer_id = $2",
                [phoneMatchedCustomer.id, matchedCustomer.id]
              );

              matchedCustomer = phoneMatchedCustomer;
            } else if (!matchedCustomer && phoneMatchedCustomer) {
              // Existing phone customer now seen with BSUID -> link BSUID
              if (senderBsuid) {
                await db
                  .update(users)
                  .set({
                    whatsappBsuid: senderBsuid,
                    whatsappUsername: whatsappUsername || phoneMatchedCustomer.whatsappUsername,
                    updatedAt: new Date(),
                  })
                  .where(eq(users.id, phoneMatchedCustomer.id));
              }
              matchedCustomer = phoneMatchedCustomer;
            } else if (!matchedCustomer && !phoneMatchedCustomer) {
              // Genuinely new customer
              if (senderBsuid && !senderPhone) {
                // Customer has only BSUID: Create record with BSUID and prompt for phone number
                const [newCustomer] = await db
                  .insert(users)
                  .values({
                    name: customerName,
                    whatsappBsuid: senderBsuid,
                    whatsappUsername,
                    role: "customer",
                    authProvider: "whatsapp",
                  })
                  .returning();

                matchedCustomer = newCustomer;

                // Send interactive "request phone number" message
                await customerMessaging.requestPhoneNumber(senderBsuid).catch((err) =>
                  console.error("[OTF Washflow] Failed to request phone number from BSUID user:", err)
                );
              } else if (senderPhone) {
                // Customer has verified phone
                const [newCustomer] = await db
                  .insert(users)
                  .values({
                    name: customerName,
                    phone: senderPhone,
                    phoneE164: senderPhone,
                    whatsappBsuid: senderBsuid || null,
                    whatsappUsername: whatsappUsername || null,
                    role: "customer",
                    authProvider: "whatsapp",
                  })
                  .returning();

                matchedCustomer = newCustomer;
              }
            } else if (matchedCustomer && senderPhone && !matchedCustomer.phoneE164) {
              // User originally had only BSUID, now provided phone -> update phone
              await db
                .update(users)
                .set({
                  phone: senderPhone,
                  phoneE164: senderPhone,
                  phoneVerifiedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(users.id, matchedCustomer.id));
            }

            // Handle user identity / BSUID changed event
            if (msg.identity?.acknowledged === false && senderBsuid && matchedCustomer) {
              console.log(`[OTF Washflow] User identity update noted for ${matchedCustomer.id}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[OTF Washflow] Webhook processing error:", err);
  }

  return res.status(200).send("EVENT_RECEIVED");
});

export default router;
