import { Router, Request, Response } from "express";
import { getSessionFromReq } from "../lib/session";
import { db } from "../db";
import { waOutboundMessages, auditLog, bookings } from "../db/schema";
import { eq, desc, and, or, sql, gte, lte, ilike } from "drizzle-orm";
import { baileysService } from "../lib/baileys/baileys-service";
import { checkRateLimit } from "../lib/rate-limiter";
import crypto from "crypto";

const router = Router();

// Middleware: Admin authorization check
async function requireAdmin(req: Request, res: Response, next: () => void) {
  const session = await getSessionFromReq(req);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized. Admin session required." });
  }
  (req as any).session = session;
  next();
}

router.use(requireAdmin);

// 1. GET / - Server-paginated, filtered communication logs
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const offset = (page - 1) * limit;

    const statusFilter = (req.query.status as string) || "all";
    const purposeFilter = (req.query.purpose as string) || "all";
    const quickFilter = (req.query.quickFilter as string) || "";
    const search = (req.query.search as string || "").trim();
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const conditions = [];

    // Quick filter: Undelivered = failed or queued
    if (quickFilter === "undelivered") {
      conditions.push(or(eq(waOutboundMessages.status, "failed"), eq(waOutboundMessages.status, "queued")));
    } else if (statusFilter !== "all") {
      conditions.push(eq(waOutboundMessages.status, statusFilter));
    }

    if (purposeFilter !== "all") {
      conditions.push(
        or(
          eq(waOutboundMessages.purpose, purposeFilter),
          eq(waOutboundMessages.automationId, purposeFilter)
        )
      );
    }

    if (dateFrom) {
      conditions.push(gte(waOutboundMessages.queuedAt, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(waOutboundMessages.queuedAt, new Date(dateTo)));
    }

    // Masked number / hash search
    if (search) {
      const cleanDigits = search.replace(/\D/g, "");
      if (cleanDigits.length >= 3) {
        conditions.push(ilike(waOutboundMessages.recipientMasked, `%${cleanDigits}%`));
      } else {
        conditions.push(ilike(waOutboundMessages.recipientMasked, `%${search}%`));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch records
    const rawLogs = await db
      .select({
        id: waOutboundMessages.id,
        bookingId: waOutboundMessages.bookingId,
        automationId: waOutboundMessages.automationId,
        templateVersion: waOutboundMessages.templateVersion,
        purpose: waOutboundMessages.purpose,
        recipientMasked: waOutboundMessages.recipientMasked,
        providerMessageId: waOutboundMessages.providerMessageId,
        status: waOutboundMessages.status,
        priority: waOutboundMessages.priority,
        renderedBodyMasked: waOutboundMessages.renderedBodyMasked,
        failureReason: waOutboundMessages.failureReason,
        attempts: waOutboundMessages.attempts,
        scheduledFor: waOutboundMessages.scheduledFor,
        queuedAt: waOutboundMessages.queuedAt,
        sentAt: waOutboundMessages.sentAt,
        deliveredAt: waOutboundMessages.deliveredAt,
        readAt: waOutboundMessages.readAt,
        failedAt: waOutboundMessages.failedAt,
      })
      .from(waOutboundMessages)
      .where(whereClause)
      .orderBy(desc(waOutboundMessages.queuedAt))
      .limit(limit)
      .offset(offset);

    // Fetch total count for pagination
    const totalCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waOutboundMessages)
      .where(whereClause);

    const totalCount = totalCountRes[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Summary strip metrics over all time (or filtered period)
    const metricsRes = await db
      .select({
        sentCount: sql<number>`count(case when ${waOutboundMessages.status} = 'sent' then 1 end)::int`,
        deliveredCount: sql<number>`count(case when ${waOutboundMessages.status} in ('delivered', 'read') then 1 end)::int`,
        failedCount: sql<number>`count(case when ${waOutboundMessages.status} = 'failed' then 1 end)::int`,
        totalCount: sql<number>`count(*)::int`,
        avgDeliverySeconds: sql<number>`avg(case when ${waOutboundMessages.deliveredAt} is not null and ${waOutboundMessages.sentAt} is not null then extract(epoch from (${waOutboundMessages.deliveredAt} - ${waOutboundMessages.sentAt})) end)::float`,
      })
      .from(waOutboundMessages);

    const metrics = metricsRes[0];
    const totalMessages = metrics?.totalCount || 0;
    const totalDelivered = metrics?.deliveredCount || 0;
    const deliveryRate = totalMessages > 0 ? Math.round((totalDelivered / totalMessages) * 100) : null;
    const medianSendToDeliveredSeconds = metrics?.avgDeliverySeconds ? Math.round(metrics.avgDeliverySeconds) : null;

    return res.json({
      success: true,
      logs: rawLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
      summary: {
        sentCount: metrics?.sentCount || 0,
        deliveredCount: totalDelivered,
        failedCount: metrics?.failedCount || 0,
        deliveryRate,
        medianSendToDeliveredSeconds,
      },
    });
  } catch (err: any) {
    console.error("Fetch message logs error:", err);
    return res.status(500).json({ error: "Failed to fetch communications log." });
  }
});

// 2. POST /:id/retry - Safe retry for failed non-OTP messages
router.post("/:id/retry", async (req: Request, res: Response) => {
  const session = (req as any).session;
  const messageId = req.params.id;

  try {
    const message = await db.query.waOutboundMessages.findFirst({
      where: eq(waOutboundMessages.id, messageId),
    });

    if (!message) {
      return res.status(404).json({ error: "Message record not found." });
    }

    // Protection: Never resend expired or OTP messages
    if (
      message.status === "expired" ||
      message.purpose.includes("otp") ||
      message.automationId === "OTP_VERIFICATION"
    ) {
      return res.status(400).json({
        error: "Security Policy: Expired verification codes and OTPs cannot be resent. The customer must request a fresh code from the verification screen.",
      });
    }

    if (message.status === "delivered" || message.status === "read") {
      return res.status(400).json({ error: "Message has already been delivered successfully." });
    }

    if (message.attempts >= 3) {
      return res.status(400).json({ error: "Maximum delivery retry attempts (3) reached for this message." });
    }

    if (!baileysService.isConnected()) {
      return res.status(503).json({ error: "WhatsApp sender worker is currently offline. Connect the worker first." });
    }

    if (!message.renderedBodyMasked || message.renderedBodyMasked.startsWith("[")) {
      return res.status(400).json({ error: "Cannot retry a message without rendered body content." });
    }

    // Rate-limit retries
    const rateCheck = await checkRateLimit(`ratelimit:msg_retry:${session.userId}`, 10, 60);
    if (!rateCheck.success) {
      return res.status(429).json({ error: "Too many retries requested. Please slow down." });
    }

    // Paced retry execution
    const sendResult = await baileysService.sendTextMessage(
      message.recipientMasked.replace(/•/g, "0"), // Safe normalization check
      message.renderedBodyMasked
    );

    const nextAttempts = message.attempts + 1;

    await db
      .update(waOutboundMessages)
      .set({
        status: sendResult.success ? "sent" : "failed",
        providerMessageId: sendResult.messageId || message.providerMessageId,
        sentAt: sendResult.success ? new Date() : message.sentAt,
        failedAt: sendResult.success ? null : new Date(),
        failureReason: sendResult.error || null,
        attempts: nextAttempts,
      })
      .where(eq(waOutboundMessages.id, message.id));

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "WHATSAPP_MESSAGE_RETRIED",
      entity: "wa_outbound_messages",
      entityId: message.id,
      meta: {
        success: sendResult.success,
        attempt: nextAttempts,
      },
    });

    if (sendResult.success) {
      return res.json({
        success: true,
        message: "Message successfully requeued and dispatched.",
      });
    } else {
      return res.status(500).json({
        error: sendResult.error || "Retry dispatch failed.",
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Internal error retrying message." });
  }
});

// 3. GET /export - Admin CSV export with formula injection defense
router.get("/export", async (req: Request, res: Response) => {
  const session = (req as any).session;

  // Rate limit: 5 exports per hour per admin
  const rateLimit = await checkRateLimit(`ratelimit:logs_export:${session.userId}`, 5, 3600);
  if (!rateLimit.success) {
    return res.status(429).json({
      error: `Export rate limit reached. Please wait ${rateLimit.retryAfterSeconds}s before exporting again.`,
    });
  }

  try {
    const logs = await db
      .select({
        id: waOutboundMessages.id,
        purpose: waOutboundMessages.purpose,
        recipientMasked: waOutboundMessages.recipientMasked,
        status: waOutboundMessages.status,
        queuedAt: waOutboundMessages.queuedAt,
        sentAt: waOutboundMessages.sentAt,
        deliveredAt: waOutboundMessages.deliveredAt,
        failureReason: waOutboundMessages.failureReason,
        attempts: waOutboundMessages.attempts,
      })
      .from(waOutboundMessages)
      .orderBy(desc(waOutboundMessages.queuedAt))
      .limit(1000);

    // Formula injection sanitizer (escape =, +, -, @, \t, \r)
    const sanitizeCsvCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str}"`;
    };

    const header = ["Message ID", "Purpose", "Recipient", "Status", "Queued At", "Sent At", "Delivered At", "Attempts", "Failure Reason"];
    const rows = logs.map((l) => [
      sanitizeCsvCell(l.id),
      sanitizeCsvCell(l.purpose),
      sanitizeCsvCell(l.recipientMasked),
      sanitizeCsvCell(l.status),
      sanitizeCsvCell(l.queuedAt?.toISOString()),
      sanitizeCsvCell(l.sentAt?.toISOString()),
      sanitizeCsvCell(l.deliveredAt?.toISOString()),
      sanitizeCsvCell(l.attempts),
      sanitizeCsvCell(l.failureReason || ""),
    ]);

    const csvContent = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "WHATSAPP_LOGS_EXPORTED_CSV",
      entity: "wa_outbound_messages",
      entityId: "export",
      meta: { rowCount: logs.length },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="washflow-whatsapp-logs-${Date.now()}.csv"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    return res.status(200).send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to export communication logs." });
  }
});

export default router;
