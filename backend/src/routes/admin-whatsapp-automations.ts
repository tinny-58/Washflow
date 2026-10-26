import { Router, Request, Response } from "express";
import { z } from "zod";
import { getSessionFromReq } from "../lib/session";
import { db } from "../db";
import {
  waAutomationTemplates,
  waAutomationTemplateHistory,
  waOutboundMessages,
  auditLog,
  bookings,
  users,
} from "../db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  ensureTemplatesSeeded,
  validateTemplateAuthoritative,
  DEFAULT_DATABASE_TEMPLATES,
  ALLOWED_VARIABLES,
  renderTemplateTokens,
} from "../lib/baileys/automations-db";
import { baileysService } from "../lib/baileys/baileys-service";
import { checkRateLimit } from "../lib/rate-limiter";
import { normalizePhone } from "../lib/phone";
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

// 1. GET /templates - List all automation templates with live statistics
router.get("/templates", async (_req: Request, res: Response) => {
  try {
    await ensureTemplatesSeeded();

    const templates = await db
      .select()
      .from(waAutomationTemplates)
      .orderBy(waAutomationTemplates.priorityClass, waAutomationTemplates.name);

    // Compute last sent and success rates for each automation from wa_outbound_messages
    const enrichedTemplates = await Promise.all(
      templates.map(async (tmpl) => {
        // Last sent
        const lastSentRow = await db
          .select({
            sentAt: waOutboundMessages.sentAt,
            queuedAt: waOutboundMessages.queuedAt,
          })
          .from(waOutboundMessages)
          .where(eq(waOutboundMessages.automationId, tmpl.id))
          .orderBy(desc(waOutboundMessages.queuedAt))
          .limit(1);

        // Success rate over last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const stats = await db
          .select({
            total: sql<number>`count(*)::int`,
            successful: sql<number>`count(case when ${waOutboundMessages.status} in ('sent', 'delivered', 'read') then 1 end)::int`,
          })
          .from(waOutboundMessages)
          .where(
            and(
              eq(waOutboundMessages.automationId, tmpl.id),
              sql`${waOutboundMessages.queuedAt} >= ${thirtyDaysAgo}`
            )
          );

        const total = stats[0]?.total || 0;
        const successful = stats[0]?.successful || 0;
        const successRate = total > 0 ? Math.round((successful / total) * 100) : null;

        return {
          id: tmpl.id,
          name: tmpl.name,
          description: tmpl.description,
          recipientType: tmpl.recipientType,
          priorityClass: tmpl.priorityClass,
          enabled: tmpl.enabled,
          template: tmpl.template,
          version: tmpl.version,
          charCount: tmpl.template.length,
          lastSentAt: lastSentRow[0]?.sentAt || lastSentRow[0]?.queuedAt || null,
          successRate,
          totalSent30d: total,
          isProtected: tmpl.id === "OTP_VERIFICATION",
          allowedVariables: Object.entries(ALLOWED_VARIABLES).map(([tag, meta]) => ({
            tag,
            label: meta.label,
            sensitive: meta.sensitive || false,
          })),
        };
      })
    );

    return res.json({ success: true, templates: enrichedTemplates });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch automation templates." });
  }
});

// 2. PUT /templates/:id - Save single template with optimistic concurrency check
const updateTemplateSchema = z.object({
  template: z.string().min(10),
  enabled: z.boolean(),
  currentVersion: z.number().int().positive(),
  changeSummary: z.string().max(255).optional(),
});

router.put("/templates/:id", async (req: Request, res: Response) => {
  const session = (req as any).session;
  const templateId = req.params.id;

  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid template update payload", details: parsed.error.flatten() });
  }

  const { template, enabled, currentVersion, changeSummary } = parsed.data;

  // 1. Fetch current template from DB
  const existing = await db.query.waAutomationTemplates.findFirst({
    where: eq(waAutomationTemplates.id, templateId),
  });

  if (!existing) {
    return res.status(404).json({ error: "Automation template not found." });
  }

  // 2. Optimistic Concurrency Check (409 Conflict if modified elsewhere)
  if (existing.version !== currentVersion) {
    return res.status(409).json({
      error: `Conflict: This template was updated by another session (currently v${existing.version}, your version was v${currentVersion}). Please reload and review recent changes before saving.`,
      currentTemplate: existing,
    });
  }

  // 3. Protected OTP Template Constraints
  if (templateId === "OTP_VERIFICATION") {
    if (!enabled) {
      return res.status(400).json({
        error: "Security Policy: The OTP Verification automation cannot be disabled.",
      });
    }
  }

  // 4. Authoritative Server-Side Validation
  const validation = validateTemplateAuthoritative({
    id: templateId,
    template,
  });

  if (!validation.valid) {
    return res.status(422).json({ error: validation.error });
  }

  const nextVersion = existing.version + 1;

  // 5. Update template in DB
  const [updated] = await db
    .update(waAutomationTemplates)
    .set({
      template,
      enabled: templateId === "OTP_VERIFICATION" ? true : enabled,
      version: nextVersion,
      updatedAt: new Date(),
      updatedBy: session.userId,
    })
    .where(eq(waAutomationTemplates.id, templateId))
    .returning();

  // 6. Record in History
  await db.insert(waAutomationTemplateHistory).values({
    templateId,
    version: nextVersion,
    template,
    action: "UPDATE",
    changedBy: session.userId,
    changeSummary: changeSummary || `Updated template to version ${nextVersion}`,
  });

  // 7. Audit Log
  await db.insert(auditLog).values({
    actorId: session.userId,
    action: "WHATSAPP_TEMPLATE_UPDATED",
    entity: "wa_automation_templates",
    entityId: templateId,
    meta: {
      fromVersion: existing.version,
      toVersion: nextVersion,
      enabled: updated.enabled,
    },
  });

  return res.json({
    success: true,
    template: updated,
    message: `Automation template '${updated.name}' updated successfully (v${nextVersion}).`,
  });
});

// 3. POST /templates/:id/reset - Reset single template to code defaults
router.post("/templates/:id/reset", async (req: Request, res: Response) => {
  const session = (req as any).session;
  const templateId = req.params.id;

  const defaultDef = DEFAULT_DATABASE_TEMPLATES[templateId];
  if (!defaultDef) {
    return res.status(404).json({ error: "No code-defined default exists for this template." });
  }

  const existing = await db.query.waAutomationTemplates.findFirst({
    where: eq(waAutomationTemplates.id, templateId),
  });

  const nextVersion = (existing?.version || 1) + 1;

  const [resetTmpl] = await db
    .insert(waAutomationTemplates)
    .values({
      id: templateId,
      name: defaultDef.name,
      description: defaultDef.description,
      recipientType: defaultDef.recipientType,
      priorityClass: defaultDef.priorityClass,
      enabled: defaultDef.enabled,
      template: defaultDef.template,
      version: nextVersion,
      updatedAt: new Date(),
      updatedBy: session.userId,
    })
    .onConflictDoUpdate({
      target: waAutomationTemplates.id,
      set: {
        template: defaultDef.template,
        enabled: defaultDef.enabled,
        version: nextVersion,
        updatedAt: new Date(),
        updatedBy: session.userId,
      },
    })
    .returning();

  await db.insert(waAutomationTemplateHistory).values({
    templateId,
    version: nextVersion,
    template: defaultDef.template,
    action: "RESET_DEFAULT",
    changedBy: session.userId,
    changeSummary: "Reset to system default template",
  });

  await db.insert(auditLog).values({
    actorId: session.userId,
    action: "WHATSAPP_TEMPLATE_RESET_TO_DEFAULT",
    entity: "wa_automation_templates",
    entityId: templateId,
    meta: { version: nextVersion },
  });

  return res.json({
    success: true,
    template: resetTmpl,
    message: `Template '${resetTmpl.name}' has been restored to default.`,
  });
});

// 4. GET /preview-order - Render template with a real order with sensitive parts masked
router.get("/preview-order", async (req: Request, res: Response) => {
  try {
    const templateId = req.query.templateId as string;
    const customTemplate = req.query.customTemplate as string | undefined;

    // Fetch the most recent active or completed booking
    const booking = await db.query.bookings.findFirst({
      with: {
        customer: true,
        address: true,
      },
      orderBy: [desc(bookings.createdAt)],
    });

    if (!booking || !booking.customer) {
      return res.json({
        success: false,
        message: "No real orders exist in the database yet to render a preview.",
      });
    }

    const tmplDef = customTemplate || (
      await db.query.waAutomationTemplates.findFirst({
        where: eq(waAutomationTemplates.id, templateId),
      })
    )?.template || "";

    // Mask sensitive fields
    const phone = booking.customer.phone || booking.customer.phoneE164 || "+254700000000";
    const maskedPhone = `+${phone.slice(1, 4)} ••• ••• ${phone.slice(-3)}`;
    const maskedAddress = booking.address?.addressText
      ? booking.address.addressText.split(",")[0] + ", [Masked for preview]"
      : "Westlands, [Masked for preview]";
    const shortId = booking.id.slice(0, 8);

    const rendered = renderTemplateTokens(tmplDef, {
      customerName: booking.customer.name,
      customerPhone: maskedPhone,
      shortId,
      pickupWindow: booking.pickupWindow,
      total: `KES ${booking.total.toLocaleString()}`,
      subtotal: `KES ${booking.subtotal.toLocaleString()}`,
      address: maskedAddress,
      landmark: booking.address?.landmark || "",
      trackingUrl: `https://washflow.co.ke/track/sample-order-token`,
      ratingUrl: `https://washflow.co.ke/rate/sample-order-token`,
      adminUrl: `https://washflow.co.ke/admin`,
    });

    return res.json({
      success: true,
      orderShortId: shortId,
      orderDate: booking.createdAt,
      rendered,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to generate realistic order preview." });
  }
});

// 5. POST /send-check - Send this template as a connectivity check ONLY to the admin's verified phone
router.post("/send-check", async (req: Request, res: Response) => {
  const session = (req as any).session;
  const { templateId, customTemplate } = req.body;

  // Rate limit check
  const rateLimit = await checkRateLimit(`ratelimit:check_template:${session.userId}`, 3, 3600);
  if (!rateLimit.success) {
    return res.status(429).json({
      error: `Check limit reached. Please wait ${rateLimit.retryAfterSeconds}s.`,
    });
  }

  const admin = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  const adminPhone = admin?.phoneE164 || admin?.phone;
  if (!adminPhone) {
    return res.status(400).json({ error: "Admin has no verified phone number." });
  }

  const normalized = normalizePhone(adminPhone);
  if (!normalized) {
    return res.status(400).json({ error: "Invalid admin phone number." });
  }

  const tmpl = customTemplate || (
    await db.query.waAutomationTemplates.findFirst({
      where: eq(waAutomationTemplates.id, templateId),
    })
  )?.template;

  if (!tmpl) {
    return res.status(400).json({ error: "Template content missing." });
  }

  // Render with dummy placeholder tokens (clearly labeled)
  const rendered = `[PREVIEW TEST MESSAGE]\n` + renderTemplateTokens(tmpl, {
    customerName: admin.name || "Admin",
    customerPhone: normalized,
    shortId: "test-001",
    pickupWindow: "Today: 2:00 PM - 5:00 PM",
    total: "1,450",
    subtotal: "1,450",
    address: "Sample Pickup Location",
    landmark: "Sample Landmark",
    trackingUrl: "https://washflow.co.ke/track/preview-only",
    ratingUrl: "https://washflow.co.ke/rate/preview-only",
    adminUrl: "https://washflow.co.ke/admin",
    code: "123456",
    expiryMinutes: "5",
  });

  const sendRes = await baileysService.sendTextMessage(normalized, rendered);

  return res.json({
    success: sendRes.success,
    message: sendRes.success
      ? `Sample preview dispatched to your phone (${normalized.slice(0, 4)}••••${normalized.slice(-3)}).`
      : sendRes.error,
  });
});

export default router;
