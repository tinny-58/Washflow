import { Router, Request, Response } from "express";
import { z } from "zod";
import { getSessionFromReq } from "../lib/session";
import { baileysService } from "../lib/baileys/baileys-service";
import { db } from "../db";
import { auditLog, waOutboundMessages, waSessionEvents, users } from "../db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { checkRateLimit } from "../lib/rate-limiter";
import { normalizePhone } from "../lib/phone";
import crypto from "crypto";

const router = Router();

// Admin role authorization middleware
async function requireAdmin(req: Request, res: Response, next: () => void) {
  const session = await getSessionFromReq(req);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized. Admin session required." });
  }
  (req as any).session = session;
  next();
}

router.use(requireAdmin);

// 1. GET /status - Real status, no hardcoded versions
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const rawStatus = baileysService.getStatus();

    // Compute real 24-hour delivery rate from PostgreSQL
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sent24h = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waOutboundMessages)
      .where(and(sql`${waOutboundMessages.queuedAt} >= ${oneDayAgo}`, eq(waOutboundMessages.status, "sent")));

    const delivered24h = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waOutboundMessages)
      .where(and(sql`${waOutboundMessages.queuedAt} >= ${oneDayAgo}`, eq(waOutboundMessages.status, "delivered")));

    const failed24h = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waOutboundMessages)
      .where(and(sql`${waOutboundMessages.queuedAt} >= ${oneDayAgo}`, eq(waOutboundMessages.status, "failed")));

    const totalOutbound = (sent24h[0]?.count || 0) + (delivered24h[0]?.count || 0) + (failed24h[0]?.count || 0);
    const successful = (delivered24h[0]?.count || 0) + (sent24h[0]?.count || 0);
    const deliveryRate24h = totalOutbound > 0 ? Math.round((successful / totalOutbound) * 100) : null;

    // Fetch recent session lifecycle events (last 10)
    const recentEvents = await db
      .select()
      .from(waSessionEvents)
      .orderBy(desc(waSessionEvents.createdAt))
      .limit(10);

    return res.json({
      success: true,
      status: {
        ...rawStatus,
        deliveryRate24h,
        metrics: {
          sent24h: sent24h[0]?.count || 0,
          delivered24h: delivered24h[0]?.count || 0,
          failed24h: failed24h[0]?.count || 0,
        },
        pacing: {
          minIntervalMs: 500,
          maxPerMinute: 15,
          active: true,
        },
        recentEvents,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to read WhatsApp worker status." });
  }
});

// 2. POST /connect
router.post("/connect", async (req: Request, res: Response) => {
  const session = (req as any).session;
  try {
    await baileysService.init();

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "WHATSAPP_WORKER_CONNECT_INITIATED",
      entity: "wa_worker",
      entityId: "baileys",
      meta: { timestamp: new Date() },
    });

    const status = baileysService.getStatus();
    return res.json({ success: true, status });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to start WhatsApp connection." });
  }
});

// 3. POST /disconnect - Requires confirmation & audit
router.post("/disconnect", async (req: Request, res: Response) => {
  const session = (req as any).session;
  try {
    const clearAuth = Boolean(req.body?.clearAuth);
    await baileysService.disconnect(clearAuth);

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: clearAuth ? "WHATSAPP_WORKER_LOGOUT_WIPED" : "WHATSAPP_WORKER_DISCONNECTED",
      entity: "wa_worker",
      entityId: "baileys",
      meta: { clearAuth, timestamp: new Date() },
    });

    const status = baileysService.getStatus();
    return res.json({
      success: true,
      status,
      message: clearAuth
        ? "WhatsApp logged out and session credentials wiped from PostgreSQL."
        : "WhatsApp socket disconnected. Credentials preserved for instant reconnection.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to disconnect WhatsApp worker." });
  }
});

// 4. POST /restart
router.post("/restart", async (req: Request, res: Response) => {
  const session = (req as any).session;
  try {
    await baileysService.restart();

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "WHATSAPP_WORKER_RESTARTED",
      entity: "wa_worker",
      entityId: "baileys",
    });

    const status = baileysService.getStatus();
    return res.json({ success: true, status, message: "WhatsApp socket restarted successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to restart WhatsApp connection." });
  }
});

// 5. POST /reset-circuit-breaker
router.post("/reset-circuit-breaker", async (req: Request, res: Response) => {
  const session = (req as any).session;
  try {
    baileysService.resetCircuitBreaker();

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "WHATSAPP_CIRCUIT_BREAKER_RESET",
      entity: "wa_worker",
      entityId: "baileys",
    });

    const status = baileysService.getStatus();
    return res.json({ success: true, status, message: "Anti-ban circuit breaker reset successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to reset circuit breaker." });
  }
});

// 6. POST /pairing-code
const pairingPhoneSchema = z.object({
  phone: z.string().min(8).max(25),
});

router.post("/pairing-code", async (req: Request, res: Response) => {
  const parsed = pairingPhoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid phone number for pairing code." });
  }

  try {
    const code = await baileysService.requestPairingCode(parsed.data.phone);
    return res.json({
      success: true,
      code,
      message: "Pairing code generated. Enter this in WhatsApp -> Linked Devices -> Link with phone number.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to generate pairing code." });
  }
});

// 7. POST /connectivity-check
// Renamed from test sender. ONLY reaches admin's verified phone, fixed text, rate limited 3/hr, audited!
router.post("/connectivity-check", async (req: Request, res: Response) => {
  const session = (req as any).session;

  // Rate limit: 3 checks per hour per admin
  const rateKey = `ratelimit:connectivity_check:${session.userId}`;
  const rateLimit = await checkRateLimit(rateKey, 3, 3600);
  if (!rateLimit.success) {
    return res.status(429).json({
      error: `Connectivity check rate limit reached. Please wait ${rateLimit.resetSeconds}s before testing again.`,
    });
  }

  // Strictly send to admin's own verified number from database session
  const adminUser = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  const targetPhone = adminUser?.phoneE164 || adminUser?.phone;
  if (!targetPhone) {
    return res.status(400).json({
      error: "Your admin account does not have a verified phone number registered. Please update your profile.",
    });
  }

  const normalized = normalizePhone(targetPhone);
  if (!normalized) {
    return res.status(400).json({ error: "Invalid admin phone number format." });
  }

  if (!baileysService.isConnected()) {
    return res.status(503).json({ error: "WhatsApp worker is currently offline. Connect the worker first." });
  }

  const fixedMessageText = `✅ WashFlow System Connectivity Check\nTimestamp: ${new Date().toISOString()}\nStatus: Baileys WhatsApp worker is online, healthy, and dispatching.`;

  const maskedDigits = normalized.replace(/\D/g, "");
  const recipientMasked = `+${maskedDigits.slice(0, 3)} ••• ••• ${maskedDigits.slice(-3)}`;
  const recipientHash = crypto.createHash("sha256").update(normalized).digest("hex");

  // Send message
  const sendRes = await baileysService.sendTextMessage(normalized, fixedMessageText);

  // Record in waOutboundMessages as purpose='system_check'
  await db.insert(waOutboundMessages).values({
    purpose: "system_check",
    recipientMasked,
    recipientHash,
    status: sendRes.success ? "sent" : "failed",
    providerMessageId: sendRes.messageId || null,
    renderedBodyMasked: "[SYSTEM CONNECTIVITY CHECK MESSAGE]",
    priority: "transactional",
    failureReason: sendRes.error || null,
    queuedAt: new Date(),
    sentAt: sendRes.success ? new Date() : null,
    failedAt: sendRes.success ? null : new Date(),
    attempts: 1,
  });

  // Audit log
  await db.insert(auditLog).values({
    actorId: session.userId,
    action: "WHATSAPP_CONNECTIVITY_CHECK_SENT",
    entity: "wa_worker",
    entityId: "system_check",
    meta: {
      recipientMasked,
      success: sendRes.success,
      messageId: sendRes.messageId,
    },
  });

  if (sendRes.success) {
    return res.json({
      success: true,
      message: `Connectivity check dispatched successfully to your verified number (${recipientMasked}).`,
      messageId: sendRes.messageId,
    });
  } else {
    return res.status(500).json({
      error: sendRes.error || "Failed to deliver WhatsApp connectivity check.",
    });
  }
});

export default router;
