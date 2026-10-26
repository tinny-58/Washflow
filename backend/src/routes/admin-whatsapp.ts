import { Router, Request, Response } from "express";
import { z } from "zod";
import { getSessionFromReq } from "../lib/session";
import { baileysService } from "../lib/baileys/baileys-service";
import {
  getAutomationsConfig,
  saveAutomationsConfig,
  DEFAULT_AUTOMATIONS,
  triggerBookingAutomation,
  type AutomationTriggerKey,
} from "../lib/baileys/automations";
import { db } from "../db";
import { bookings, users, notifications, auditLog, waSessionEvents, waOutboundMessages } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { broadcastAdminEvent } from "../lib/sse";
import { isValidTransition } from "../lib/state-machine";

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

// 1. GET /api/admin/whatsapp/status
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = baileysService.getStatus();
    return res.json({
      success: true,
      status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to read WhatsApp status" });
  }
});

// 2. POST /api/admin/whatsapp/connect
router.post("/connect", async (_req: Request, res: Response) => {
  try {
    await baileysService.init();
    const status = baileysService.getStatus();
    return res.json({ success: true, status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to start WhatsApp connection." });
  }
});

// 3. POST /api/admin/whatsapp/disconnect
router.post("/disconnect", async (req: Request, res: Response) => {
  try {
    const clearAuth = Boolean(req.body?.clearAuth);
    await baileysService.disconnect(clearAuth);
    const status = baileysService.getStatus();
    return res.json({
      success: true,
      status,
      message: clearAuth
        ? "Disconnected and cleared WhatsApp credentials successfully."
        : "Disconnected WhatsApp socket successfully.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to disconnect WhatsApp." });
  }
});

// 3b. POST /api/admin/whatsapp/reset-circuit-breaker
router.post("/reset-circuit-breaker", async (_req: Request, res: Response) => {
  try {
    baileysService.resetCircuitBreaker();
    const status = baileysService.getStatus();
    return res.json({
      success: true,
      status,
      message: "WhatsApp circuit breaker reset successfully.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to reset circuit breaker." });
  }
});

// 4. POST /api/admin/whatsapp/restart
router.post("/restart", async (_req: Request, res: Response) => {
  try {
    await baileysService.restart();
    const status = baileysService.getStatus();
    return res.json({ success: true, status, message: "Restarting WhatsApp connection." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to restart WhatsApp connection." });
  }
});

// 4b. POST /api/admin/whatsapp/pairing-code
const pairingCodeSchema = z.object({
  phone: z.string().min(8).max(25),
});

router.post("/pairing-code", async (req: Request, res: Response) => {
  const parsed = pairingCodeSchema.safeParse(req.body);
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

// 5. POST /api/admin/whatsapp/test
const testMessageSchema = z.object({
  phone: z.string().min(5).max(30),
  message: z.string().min(1).max(1000),
});

router.post("/test", async (req: Request, res: Response) => {
  const parsed = testMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid test message parameters", details: parsed.error.flatten() });
  }

  const { phone, message } = parsed.data;
  const result = await baileysService.sendTextMessage(phone, message);

  if (result.success) {
    return res.json({
      success: true,
      messageId: result.messageId,
      message: `Test WhatsApp message sent to ${phone}`,
    });
  } else {
    return res.status(400).json({
      success: false,
      error: result.error || "Failed to deliver WhatsApp message",
    });
  }
});

// 6. GET /api/admin/whatsapp/automations
router.get("/automations", (_req: Request, res: Response) => {
  const automations = getAutomationsConfig();
  return res.json({ success: true, automations });
});

// 7. PUT /api/admin/whatsapp/automations
const updateAutomationsSchema = z.object({
  automations: z.record(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      recipient: z.enum(["customer", "admin"]),
      enabled: z.boolean(),
      template: z.string().min(1),
    })
  ),
});

router.put("/automations", (req: Request, res: Response) => {
  const parsed = updateAutomationsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid automation configuration", details: parsed.error.flatten() });
  }

  const updated = saveAutomationsConfig(parsed.data.automations as any);
  return res.json({ success: true, automations: updated, message: "Automations saved successfully." });
});

// 8. POST /api/admin/whatsapp/automations/reset
router.post("/automations/reset", (_req: Request, res: Response) => {
  const reset = saveAutomationsConfig(DEFAULT_AUTOMATIONS);
  return res.json({ success: true, automations: reset, message: "Automations reset to defaults." });
});

// 9. POST /api/admin/whatsapp/send-booking-message
const sendBookingMessageSchema = z.object({
  bookingId: z.string().uuid(),
  message: z.string().min(1).max(1000),
});

router.post("/send-booking-message", async (req: Request, res: Response) => {
  const session = (req as any).session;
  const parsed = sendBookingMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid parameters", details: parsed.error.flatten() });
  }

  const { bookingId, message } = parsed.data;

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: {
      customer: true,
    },
  });

  if (!booking || !booking.customer) {
    return res.status(404).json({ error: "Booking or customer not found." });
  }

  if (!booking.customer.phone) {
    return res.status(400).json({ error: "Customer has no phone number configured." });
  }

  const sendResult = await baileysService.sendTextMessage(booking.customer.phone, message);

  // Record notification
  await db.insert(notifications).values({
    type: "ADMIN_DIRECT_WHATSAPP",
    bookingId: booking.id,
    channel: "whatsapp",
    status: sendResult.success ? "SENT" : "FAILED",
    attempts: 1,
    lastError: sendResult.error || null,
    payload: {
      to: booking.customer.phone,
      sentByAdminId: session.userId,
      message,
    },
  });

  if (sendResult.success) {
    return res.json({ success: true, messageId: sendResult.messageId });
  } else {
    return res.status(400).json({ success: false, error: sendResult.error });
  }
});

// 10. POST /api/admin/whatsapp/bookings/:id/confirm (One-click Confirm & WhatsApp Customer)
router.post("/bookings/:id/confirm", async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const bookingId = req.params.id;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        customer: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (booking.status !== "PENDING") {
      // If already confirmed or beyond, still allow sending confirmation WhatsApp if requested
      const autoRes = await triggerBookingAutomation(bookingId, "BOOKING_CONFIRMED");
      return res.json({
        success: true,
        booking,
        message: "Confirmation WhatsApp resent to customer.",
        whatsappResult: autoRes,
      });
    }

    // Check transition
    if (!isValidTransition(booking.status, "CONFIRMED")) {
      return res.status(400).json({
        error: `Cannot transition from "${booking.status}" to "CONFIRMED".`,
      });
    }

    // Update status to CONFIRMED
    const [updatedBooking] = await db
      .update(bookings)
      .set({
        status: "CONFIRMED",
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    // Audit log
    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "BOOKING_CONFIRMED_VIA_WHATSAPP",
      entity: "bookings",
      entityId: booking.id,
      meta: {
        fromStatus: booking.status,
        toStatus: "CONFIRMED",
      },
    });

    // Trigger WhatsApp Automation
    const autoRes = await triggerBookingAutomation(bookingId, "BOOKING_CONFIRMED");

    // SSE Broadcast
    broadcastAdminEvent("booking_updated", {
      id: booking.id,
      fromStatus: booking.status,
      toStatus: "CONFIRMED",
      updatedAt: updatedBooking.updatedAt,
    });

    return res.json({
      success: true,
      booking: updatedBooking,
      message: `Booking confirmed and WhatsApp notification dispatched to ${booking.customer.name}`,
      whatsappResult: autoRes,
    });
  } catch (err: any) {
    console.error("Confirm booking error:", err);
    return res.status(500).json({ error: "Failed to confirm booking." });
  }
});

// 11. GET /api/admin/whatsapp/logs
router.get("/logs", async (_req: Request, res: Response) => {
  try {
    const rawLogs = await db
      .select({
        id: waOutboundMessages.id,
        purpose: waOutboundMessages.purpose,
        recipientMasked: waOutboundMessages.recipientMasked,
        status: waOutboundMessages.status,
        queuedAt: waOutboundMessages.queuedAt,
        sentAt: waOutboundMessages.sentAt,
        deliveredAt: waOutboundMessages.deliveredAt,
        readAt: waOutboundMessages.readAt,
        failedAt: waOutboundMessages.failedAt,
        failureReason: waOutboundMessages.failureReason,
      })
      .from(waOutboundMessages)
      .orderBy(desc(waOutboundMessages.queuedAt))
      .limit(50);

    const logs = rawLogs.map((l) => ({
      id: l.id,
      purpose: l.purpose,
      type: l.purpose,
      channel: "whatsapp",
      recipientMasked: l.recipientMasked,
      status: l.status,
      queuedAt: l.queuedAt,
      createdAt: l.queuedAt,
      sentAt: l.sentAt,
      deliveredAt: l.deliveredAt,
      readAt: l.readAt,
      failedAt: l.failedAt,
      failureReason: l.failureReason,
      lastError: l.failureReason,
      payload: { to: l.recipientMasked },
    }));

    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch notification logs." });
  }
});

export default router;
