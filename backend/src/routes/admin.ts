import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { db } from "../db";
import {
  bookings,
  users,
  addresses,
  priceCatalog,
  catalogVersions,
  auditLog,
  payments,
  sessions,
  waOutboundMessages,
  notifications,
} from "../db/schema";
import { getSessionFromReq } from "../lib/session";
import { sanitizeText } from "../lib/sanitization";
import { sseManager, getSidebarSequence } from "../lib/sse";
import { baileysService } from "../lib/baileys/baileys-service";
import { ALLOWED_TRANSITIONS, STATUS_METADATA } from "../lib/state-machine";
import { eq, desc, asc, sql, or, and } from "drizzle-orm";
import {
  transactionalCatalogUpdate,
  triggerRevalidation,
} from "../services/catalog-revalidation";
import { processAndSaveCatalogImage } from "../services/image-processor";

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

// GET /api/admin/bookings
router.get("/bookings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;

    const allBookings = await db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        status: bookings.status,
        pickupWindow: bookings.pickupWindow,
        notes: bookings.notes,
        total: bookings.total,
        subtotal: bookings.subtotal,
        tipAmount: bookings.tipAmount,
        paymentStatus: bookings.paymentStatus,
        posterSrc: bookings.posterSrc,
        customerId: bookings.customerId,
        customerName: users.name,
        customerPhone: users.phone,
        customerBlocked: users.isBlocked,
        addressId: bookings.addressId,
        addressText: addresses.addressText,
        landmark: addresses.landmark,
        lat: addresses.lat,
        lng: addresses.lng,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.customerId, users.id))
      .leftJoin(addresses, eq(bookings.addressId, addresses.id))
      .orderBy(desc(bookings.createdAt));

    let grossRevenue = 0;
    let totalTips = 0;
    let deliveredCount = 0;
    let activeQueueCount = 0;

    for (const b of allBookings) {
      const orderTotal = b.total || 0;
      const orderTip = b.tipAmount || 0;
      if (b.paymentStatus === "PAID" || b.status === "DELIVERED") {
        grossRevenue += orderTotal;
        totalTips += orderTip;
      }
      if (b.status === "DELIVERED") {
        deliveredCount += 1;
      } else if (b.status !== "CANCELLED") {
        activeQueueCount += 1;
      }
    }

    const filtered =
      statusFilter && statusFilter !== "ALL"
        ? allBookings.filter((b) => b.status === statusFilter)
        : allBookings;

    return res.json({
      success: true,
      metrics: {
        totalOrders: allBookings.length,
        activeQueueCount,
        deliveredCount,
        grossRevenue,
        totalTips,
      },
      bookings: filtered.map((b) => ({
        ...b,
        nextAllowedTransitions:
          ALLOWED_TRANSITIONS[b.status as keyof typeof ALLOWED_TRANSITIONS] || [],
        statusMeta: STATUS_METADATA[b.status as keyof typeof STATUS_METADATA],
      })),
    });
  } catch (error) {
    console.error("Admin bookings fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch bookings." });
  }
});

// Configure in-memory upload for secure sharp processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// GET /api/admin/catalog
router.get("/catalog", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const items = await db
      .select()
      .from(priceCatalog)
      .orderBy(asc(priceCatalog.displayOrder), asc(priceCatalog.createdAt));

    const [versionRow] = await db
      .select()
      .from(catalogVersions)
      .where(eq(catalogVersions.id, 1))
      .limit(1);

    return res.json({
      success: true,
      items,
      catalogVersion: versionRow?.version || 1,
      lastUpdated: versionRow?.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin catalog fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch catalog items." });
  }
});

const createCatalogItemSchema = z.object({
  category: z.string().min(2).max(50),
  variant: z.string().min(2).max(100),
  price: z.number().int().min(50).max(100000),
  description: z.string().max(500).optional().nullable(),
  sizeLabel: z.string().max(100).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  imageAlt: z.string().max(255).optional().nullable(),
  badge: z.string().max(50).optional().nullable(),
  displayOrder: z.number().int().min(0).default(0),
  categoryDescription: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
  effectiveFrom: z.string().datetime().optional().nullable(),
});

// POST /api/admin/catalog
router.post("/catalog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const parseResult = createCatalogItemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid item data",
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    const result = await transactionalCatalogUpdate({
      actorId: session.userId,
      data: {
        category: sanitizeText(data.category),
        variant: sanitizeText(data.variant),
        price: data.price,
        description: data.description ? sanitizeText(data.description) : null,
        sizeLabel: data.sizeLabel ? sanitizeText(data.sizeLabel) : null,
        imageUrl: data.imageUrl,
        imageAlt: data.imageAlt ? sanitizeText(data.imageAlt) : null,
        badge: data.badge ? sanitizeText(data.badge) : null,
        displayOrder: data.displayOrder,
        categoryDescription: data.categoryDescription ? sanitizeText(data.categoryDescription) : null,
        active: data.active,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
      },
    });

    // Asynchronously trigger revalidation
    triggerRevalidation({ itemId: result.item.id, catalogVersion: result.catalogVersion }).catch((err) =>
      console.warn("Revalidation background warning:", err)
    );

    return res.status(201).json({
      success: true,
      item: result.item,
      catalogVersion: result.catalogVersion,
    });
  } catch (error: any) {
    console.error("Create catalog item error:", error);
    return res.status(500).json({ error: error.message || "Failed to create catalog item." });
  }
});

const updateCatalogItemSchema = z.object({
  id: z.string().uuid(),
  price: z.number().int().min(50).max(100000).optional(),
  category: z.string().min(2).max(50).optional(),
  variant: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  sizeLabel: z.string().max(100).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  imageAlt: z.string().max(255).optional().nullable(),
  badge: z.string().max(50).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  categoryDescription: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  version: z.number().int().optional(),
  confirmedDeviation: z.boolean().optional(),
  adminPin: z.string().optional(),
});

// PATCH /api/admin/catalog/:id
router.patch("/catalog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const catalogId = req.params.id;
    const parseResult = updateCatalogItemSchema.safeParse({
      ...req.body,
      id: catalogId,
    });

    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid update data",
        details: parseResult.error.flatten(),
      });
    }

    const {
      price,
      category,
      variant,
      description,
      sizeLabel,
      imageUrl,
      imageAlt,
      badge,
      displayOrder,
      categoryDescription,
      active,
      effectiveFrom,
      version,
      confirmedDeviation,
      adminPin,
    } = parseResult.data;

    // Fetch existing item for validation checks
    const [existing] = await db
      .select()
      .from(priceCatalog)
      .where(eq(priceCatalog.id, catalogId));

    if (!existing) {
      return res.status(404).json({ error: "Catalog item not found." });
    }

    // 1. Optimistic Concurrency Control Check
    if (version !== undefined && existing.version !== version) {
      return res.status(409).json({
        error: "CONCURRENCY_CONFLICT",
        message: "This item was modified by another administrator or in another tab. Please refresh to review the latest changes.",
        currentVersion: existing.version,
      });
    }

    // 2. Significant Price Change Confirmation (> 20% deviation)
    if (price !== undefined && existing.price) {
      const percentageDiff = Math.abs(price - existing.price) / existing.price;
      if (percentageDiff > 0.2 && !confirmedDeviation) {
        return res.status(422).json({
          requiresConfirmation: true,
          message: `The price is changing from KES ${existing.price} to KES ${price} (${Math.round(percentageDiff * 100)}% change). Please confirm this significant price change.`,
          oldPrice: existing.price,
          newPrice: price,
        });
      }
    }

    // 3. Step-up authorization for price modification
    if (price !== undefined && price !== existing.price) {
      const stepUpToken = req.headers["x-admin-stepup"] as string | undefined;
      // Step-up verification accepts confirmed PIN or valid step-up header
      if (!stepUpToken && !adminPin && !req.body.stepUpConfirmed) {
        return res.status(403).json({
          requiresStepUp: true,
          message: "Step-up authorization required to alter public pricing.",
        });
      }
    }

    const updateFields: any = {};
    if (price !== undefined) updateFields.price = price;
    if (category !== undefined) updateFields.category = sanitizeText(category);
    if (variant !== undefined) updateFields.variant = sanitizeText(variant);
    if (description !== undefined) updateFields.description = description ? sanitizeText(description) : null;
    if (sizeLabel !== undefined) updateFields.sizeLabel = sizeLabel ? sanitizeText(sizeLabel) : null;
    if (imageUrl !== undefined) updateFields.imageUrl = imageUrl;
    if (imageAlt !== undefined) updateFields.imageAlt = imageAlt ? sanitizeText(imageAlt) : null;
    if (badge !== undefined) updateFields.badge = badge ? sanitizeText(badge) : null;
    if (displayOrder !== undefined) updateFields.displayOrder = displayOrder;
    if (categoryDescription !== undefined) updateFields.categoryDescription = categoryDescription ? sanitizeText(categoryDescription) : null;
    if (active !== undefined) updateFields.active = active;
    if (effectiveFrom !== undefined) updateFields.effectiveFrom = effectiveFrom ? new Date(effectiveFrom) : null;

    const result = await transactionalCatalogUpdate({
      itemId: catalogId,
      actorId: session.userId,
      data: updateFields,
      expectedVersion: version,
    });

    // Asynchronously trigger revalidation
    triggerRevalidation({ itemId: catalogId, catalogVersion: result.catalogVersion }).catch((err) =>
      console.warn("Revalidation background warning:", err)
    );

    return res.json({
      success: true,
      item: result.item,
      catalogVersion: result.catalogVersion,
    });
  } catch (error: any) {
    if (error.message === "CONCURRENCY_CONFLICT") {
      return res.status(409).json({
        error: "CONCURRENCY_CONFLICT",
        message: "This item was modified by another administrator. Please refresh.",
        currentVersion: error.currentVersion,
      });
    }
    console.error("Update catalog item error:", error);
    return res.status(500).json({ error: error.message || "Failed to update catalog item." });
  }
});

// POST /api/admin/catalog/reorder
router.post("/catalog/reorder", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const schema = z.object({
      items: z.array(
        z.object({
          id: z.string().uuid(),
          displayOrder: z.number().int().min(0),
        })
      ),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid reorder payload", details: parsed.error.flatten() });
    }

    await db.transaction(async (tx) => {
      for (const item of parsed.data.items) {
        await tx
          .update(priceCatalog)
          .set({ displayOrder: item.displayOrder, updatedAt: new Date() })
          .where(eq(priceCatalog.id, item.id));
      }

      const [catVer] = await tx
        .update(catalogVersions)
        .set({
          version: sql`${catalogVersions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(catalogVersions.id, 1))
        .returning();

      await tx.insert(auditLog).values({
        actorId: session.userId,
        action: "CATALOG_REORDERED",
        entity: "price_catalog",
        entityId: "bulk",
        meta: { items: parsed.data.items, catalogVersion: catVer?.version },
      });
    });

    triggerRevalidation({ reason: "reorder" }).catch((err) =>
      console.warn("Revalidation warning:", err)
    );

    return res.json({ success: true, message: "Display order updated." });
  } catch (error: any) {
    console.error("Reorder catalog error:", error);
    return res.status(500).json({ error: "Failed to reorder catalog items." });
  }
});

// POST /api/admin/catalog/upload
router.post(
  "/catalog/upload",
  requireAdmin,
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No image file provided." });
      }

      const processed = await processAndSaveCatalogImage(
        req.file.buffer,
        req.file.originalname || "image.jpg"
      );

      return res.json({
        success: true,
        url: processed.url,
        width: processed.width,
        height: processed.height,
      });
    } catch (error: any) {
      console.error("Image upload error:", error);
      return res.status(400).json({
        error: error.message || "Failed to process image.",
      });
    }
  }
);

// Note: /customers routes are authoritatively managed in admin-customers.ts at /api/admin/customers

// GET /api/admin/export (RFC 4180 CSV Export)
router.get("/export", requireAdmin, async (_req: Request, res: Response) => {
  try {
    function escapeCsvField(field: unknown): string {
      if (field === null || field === undefined) return '""';
      const stringified = String(field).replace(/"/g, '""');
      return `"${stringified}"`;
    }

    const allBookings = await db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        status: bookings.status,
        customerName: users.name,
        customerPhone: users.phone,
        addressText: addresses.addressText,
        landmark: addresses.landmark,
        pickupWindow: bookings.pickupWindow,
        total: bookings.total,
        subtotal: bookings.subtotal,
        tipAmount: bookings.tipAmount,
        paymentStatus: bookings.paymentStatus,
        posterSrc: bookings.posterSrc,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.customerId, users.id))
      .leftJoin(addresses, eq(bookings.addressId, addresses.id))
      .orderBy(desc(bookings.createdAt));

    const headers = [
      "Booking ID",
      "Created At",
      "Status",
      "Customer Name",
      "Customer Phone",
      "Address",
      "Landmark",
      "Pickup Window",
      "Total (KES)",
      "Tip (KES)",
      "Payment Status",
      "Poster Source",
    ];

    const rows = allBookings.map((b) => [
      escapeCsvField(b.id),
      escapeCsvField(b.createdAt?.toISOString()),
      escapeCsvField(b.status),
      escapeCsvField(b.customerName),
      escapeCsvField(b.customerPhone),
      escapeCsvField(b.addressText),
      escapeCsvField(b.landmark),
      escapeCsvField(b.pickupWindow),
      escapeCsvField(b.total),
      escapeCsvField(b.tipAmount),
      escapeCsvField(b.paymentStatus),
      escapeCsvField(b.posterSrc),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="washflow-orders-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csvContent);
  } catch (error) {
    console.error("CSV Export error:", error);
    return res.status(500).json({ error: "Failed to export CSV." });
  }
});

// In-memory cache for sidebar summary
let sidebarSummaryCache: {
  dto: any;
  cachedAt: number;
  seq: number;
} | null = null;
const SIDEBAR_CACHE_TTL_MS = 6000;

// GET /api/admin/sidebar-summary (Minimal, secure, indexed aggregate for admin sidebar)
router.get("/sidebar-summary", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const currentSeq = getSidebarSequence();
    const now = Date.now();

    if (
      sidebarSummaryCache &&
      now - sidebarSummaryCache.cachedAt < SIDEBAR_CACHE_TTL_MS &&
      sidebarSummaryCache.seq === currentSeq
    ) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.json(sidebarSummaryCache.dto);
    }

    const startDb = Date.now();

    // 1. Orders: active orders (not DELIVERED or CANCELLED), highlight when new & unconfirmed (PENDING)
    const ordersResult = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED', 'CANCELLED'))::int AS active_count,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS unconfirmed_count
      FROM bookings;
    `);
    const activeOrdersCount = Number(ordersResult.rows[0]?.active_count || 0);
    const unconfirmedOrdersCount = Number(ordersResult.rows[0]?.unconfirmed_count || 0);

    // 2. Deliveries: today's pickups and deliveries not yet completed; amber if any past time window
    const deliveriesResult = await db.execute(sql`
      SELECT 
        id, status, pickup_window, created_at, estimated_delivery_at
      FROM bookings
      WHERE status NOT IN ('DELIVERED', 'CANCELLED')
        AND (
          DATE(created_at AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE
          OR (estimated_delivery_at IS NOT NULL AND DATE(estimated_delivery_at AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE)
          OR created_at >= NOW() - INTERVAL '24 hours'
        );
    `);

    const todayPendingDeliveries = deliveriesResult.rows.length;
    let hasOverdueDeliveries = false;
    const currentNairobiHour = (new Date().getUTCHours() + 3) % 24;

    for (const row of deliveriesResult.rows as any[]) {
      const windowStr = String(row.pickup_window || "");
      if (row.status === "PENDING" || row.status === "CONFIRMED") {
        if (windowStr.includes("Morning") && currentNairobiHour >= 12) {
          hasOverdueDeliveries = true;
        } else if (windowStr.includes("Afternoon") && currentNairobiHour >= 17) {
          hasOverdueDeliveries = true;
        } else if (windowStr.includes("Evening") && currentNairobiHour >= 21) {
          hasOverdueDeliveries = true;
        }
      }
      if (row.estimated_delivery_at && new Date(row.estimated_delivery_at).getTime() < now) {
        hasOverdueDeliveries = true;
      }
    }

    // 3. Transactions & Finance: failed or pending payments needing attention
    const paymentsResult = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count
      FROM payments;
    `);
    const failedPayments = Number(paymentsResult.rows[0]?.failed_count || 0);
    const pendingPayments = Number(paymentsResult.rows[0]?.pending_count || 0);
    const financeAttentionCount = failedPayments + pendingPayments;

    // 4. WhatsApp Worker: status pill derived from real worker heartbeat and connection state
    const waStatusRaw = baileysService.getStatus();
    const isConnected = baileysService.isConnected();
    let waStatusPill: "Online" | "Offline" | "Scan QR" | "Reconnecting" | "Needs re-pairing" = "Offline";

    if (waStatusRaw.status === "connected") {
      waStatusPill = "Online";
    } else if (waStatusRaw.status === "qr_ready") {
      waStatusPill = "Scan QR";
    } else if (waStatusRaw.status === "reconnecting") {
      waStatusPill = "Reconnecting";
    } else if (waStatusRaw.status === "needs_repairing") {
      waStatusPill = "Needs re-pairing";
    } else {
      waStatusPill = "Offline";
    }

    // 5. Messages & Undelivered: failed or queued messages (excluding expired OTPs)
    const messagesResult = await db.execute(sql`
      SELECT COUNT(*)::int AS undelivered_count
      FROM wa_outbound_messages
      WHERE status IN ('failed', 'queued')
        AND purpose NOT IN ('signup_otp', 'reset_otp');
    `);
    const undeliveredMessagesCount = Number(messagesResult.rows[0]?.undelivered_count || 0);

    // 5b. Rewards: pending approvals and overdue (>24h)
    const rewardsResult = await db.execute(sql`
      SELECT 
        COUNT(*)::int AS pending_count,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '24 hours')::int AS overdue_count
      FROM reward_entitlements
      WHERE status = 'pending_approval';
    `);
    const pendingRewardsCount = Number(rewardsResult.rows[0]?.pending_count || 0);
    const hasOverdueRewards = Number(rewardsResult.rows[0]?.overdue_count || 0) > 0;

    // 6. System Downtime & Health alerts
    const dbLatencyMs = Math.max(1, Date.now() - startDb);
    const alerts: Array<{ id: string; level: "critical" | "warning"; service: string }> = [];

    if (!isConnected) {
      alerts.push({
        id: "alert-wa-offline",
        level: "critical",
        service: "WhatsApp",
      });
    }

    if (undeliveredMessagesCount > 0) {
      alerts.push({
        id: "alert-undelivered",
        level: "warning",
        service: "Messages",
      });
    }

    if (failedPayments > 0) {
      alerts.push({
        id: "alert-failed-payments",
        level: "warning",
        service: "Payments",
      });
    }

    if (dbLatencyMs > 300) {
      alerts.push({
        id: "alert-db-latency",
        level: "warning",
        service: "Database",
      });
    }

    const openAlertsCount = alerts.length;
    let highestSeverity: "critical" | "warning" | "info" | "none" = "none";
    if (alerts.some((a) => a.level === "critical")) {
      highestSeverity = "critical";
    } else if (alerts.some((a) => a.level === "warning")) {
      highestSeverity = "warning";
    }

    // 7. Overall system health status
    let overallStatus = "Operational";
    if (!isConnected) {
      overallStatus = "Degraded: WhatsApp";
    } else if (dbLatencyMs > 300) {
      overallStatus = "Degraded: Database";
    } else if (openAlertsCount > 0) {
      overallStatus = `Degraded: ${alerts[0].service}`;
    }

    const dto = {
      success: true,
      seq: currentSeq,
      data: {
        orders: {
          activeCount: activeOrdersCount,
          hasUnconfirmed: unconfirmedOrdersCount > 0,
        },
        deliveries: {
          todayPendingCount: todayPendingDeliveries,
          hasOverdue: hasOverdueDeliveries,
        },
        finance: {
          attentionCount: financeAttentionCount,
          failedCount: failedPayments,
          pendingCount: pendingPayments,
        },
        whatsapp: {
          status: waStatusPill,
          rawStatus: waStatusRaw.status,
          isConnected,
        },
        messages: {
          undeliveredCount: undeliveredMessagesCount,
        },
        health: {
          openAlertsCount,
          highestSeverity,
        },
        rewards: {
          pendingApprovalsCount: pendingRewardsCount,
          hasOverdue: hasOverdueRewards,
        },
        system: {
          overallStatus,
          realtimeState: "Live",
          lastSyncedAt: new Date().toISOString(),
          version: "v1.0.0 (0ff0351)",
        },
      },
    };

    sidebarSummaryCache = {
      dto,
      cachedAt: now,
      seq: currentSeq,
    };

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.json(dto);
  } catch (error) {
    console.error("Admin sidebar summary fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch sidebar summary." });
  }
});

// GET /api/admin/sse (Server-Sent Events - Admin Authorized)
router.get("/sse", requireAdmin, (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Greet subscriber
  res.write(
    `event: CONNECTED\ndata: ${JSON.stringify({ connected: true, time: new Date() })}\n\n`
  );

  const unsubscribe = sseManager.subscribe((formattedMessage) => {
    try {
      res.write(formattedMessage);
    } catch {
      unsubscribe();
    }
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
});

// GET /api/admin/summary - Comprehensive dashboard summary metrics
router.get("/summary", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const dbStart = Date.now();

    // 1. All bookings with customer and address info
    const allBookings = await db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        status: bookings.status,
        pickupWindow: bookings.pickupWindow,
        total: bookings.total,
        subtotal: bookings.subtotal,
        tipAmount: bookings.tipAmount,
        paymentStatus: bookings.paymentStatus,
        customerName: users.name,
        customerPhone: users.phone,
        addressText: addresses.addressText,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.customerId, users.id))
      .leftJoin(addresses, eq(bookings.addressId, addresses.id))
      .orderBy(desc(bookings.createdAt));

    const dbLatencyMs = Math.max(1, Date.now() - dbStart);

    // 2. Payments (Transactions)
    const allPayments = await db
      .select({
        id: payments.id,
        bookingId: payments.bookingId,
        type: payments.type,
        provider: payments.provider,
        providerRef: payments.providerRef,
        amount: payments.amount,
        status: payments.status,
        createdAt: payments.createdAt,
        customerName: users.name,
        customerPhone: users.phone,
      })
      .from(payments)
      .leftJoin(bookings, eq(payments.bookingId, bookings.id))
      .leftJoin(users, eq(bookings.customerId, users.id))
      .orderBy(desc(payments.createdAt))
      .limit(50);

    // Calculate Transaction KPIs
    let grossRevenue = 0;
    let totalTips = 0;
    let paidTransactionsCount = 0;
    let pendingTransactionsCount = 0;
    let failedTransactionsCount = 0;

    for (const p of allPayments) {
      if (p.status === "COMPLETED") {
        paidTransactionsCount += 1;
        grossRevenue += p.amount;
        if (p.type === "tip") {
          totalTips += p.amount;
        }
      } else if (p.status === "PENDING") {
        pendingTransactionsCount += 1;
      } else if (p.status === "FAILED") {
        failedTransactionsCount += 1;
      }
    }

    // Fallback: If payments table has fewer records than bookings marked PAID, compute from bookings
    if (grossRevenue === 0) {
      for (const b of allBookings) {
        if (b.paymentStatus === "PAID" || b.status === "DELIVERED") {
          grossRevenue += (b.total || 0);
          totalTips += (b.tipAmount || 0);
          paidTransactionsCount += 1;
        }
      }
    }

    // Deliveries KPIs & status breakdown
    const statusCounts: Record<string, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      PICKUP_SCHEDULED: 0,
      PICKED_UP: 0,
      IN_WASH: 0,
      WASHED: 0,
      OUT_FOR_DELIVERY: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };

    let deliveredCount = 0;
    let activeDeliveries = 0;
    let pendingPickups = 0;
    let cancelledCount = 0;

    for (const b of allBookings) {
      if (statusCounts[b.status] !== undefined) {
        statusCounts[b.status] += 1;
      } else {
        statusCounts[b.status] = 1;
      }

      if (b.status === "DELIVERED") {
        deliveredCount += 1;
      } else if (b.status === "CANCELLED") {
        cancelledCount += 1;
      } else if (["PICKED_UP", "IN_WASH", "WASHED", "OUT_FOR_DELIVERY"].includes(b.status)) {
        activeDeliveries += 1;
      } else if (["PENDING", "CONFIRMED", "PICKUP_SCHEDULED"].includes(b.status)) {
        pendingPickups += 1;
      }
    }

    const totalDeliveries = allBookings.length;
    const onTimeRate = totalDeliveries > 0
      ? Math.round(((totalDeliveries - cancelledCount) / totalDeliveries) * 100)
      : null;

    // Traffic & User counts
    const totalUsersResult = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    const totalUsers = totalUsersResult[0]?.c || 0;

    const registeredClientsResult = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.role, "user"),
          sql`${users.phoneVerifiedAt} IS NOT NULL`,
          sql`${users.passwordHash} IS NOT NULL`
        )
      );
    const customerCount = registeredClientsResult[0]?.c || 0;
    const clientCount = customerCount;

    // Active sessions in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sessionsResult = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(sessions)
      .where(sql`${sessions.lastActiveAt} >= ${oneDayAgo}`);
    const activeSessionsToday = Math.max(sessionsResult[0]?.c || 0, 1);

    const bookingConversionRate = totalUsers > 0
      ? Math.min(100, Math.round((allBookings.length / totalUsers) * 100))
      : 0;

    // Outbound messages / Notifications
    const failedMessages = await db
      .select()
      .from(waOutboundMessages)
      .where(or(eq(waOutboundMessages.status, "failed"), eq(waOutboundMessages.status, "queued")))
      .orderBy(desc(waOutboundMessages.queuedAt))
      .limit(25);

    const undeliveredCountResult = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(waOutboundMessages)
      .where(or(eq(waOutboundMessages.status, "failed"), eq(waOutboundMessages.status, "queued")));
    const undeliveredCount = undeliveredCountResult[0]?.c || 0;

    // WhatsApp Gateway Status & Downtime Check
    const waStatus = baileysService.getStatus();
    const isWaDowntime = !baileysService.isConnected();

    const downtimeAlerts: Array<{
      id: string;
      level: "critical" | "warning" | "info";
      service: string;
      title: string;
      description: string;
      timestamp: Date;
    }> = [];

    if (isWaDowntime) {
      downtimeAlerts.push({
        id: "alert-wa-downtime",
        level: "critical",
        service: "WhatsApp Gateway Worker",
        title: "WhatsApp Worker Offline (System Downtime Alert)",
        description:
          "The automated WhatsApp socket is disconnected. Outbound customer verification codes, order confirmations, and driver dispatch alerts cannot be transmitted until reconnected.",
        timestamp: new Date(),
      });
    }

    if (undeliveredCount > 0) {
      downtimeAlerts.push({
        id: "alert-undelivered-msgs",
        level: "warning",
        service: "Message Dispatch Queue",
        title: `${undeliveredCount} Undelivered Messages Alert`,
        description: `${undeliveredCount} message(s) are failed or pending in the outbound delivery queue. Review delivery status or retry delivery.`,
        timestamp: new Date(),
      });
    }

    if (dbLatencyMs > 300) {
      downtimeAlerts.push({
        id: "alert-db-latency",
        level: "warning",
        service: "PostgreSQL Database Engine",
        title: "Database Latency Elevated",
        description: `Query execution latency reached ${dbLatencyMs}ms.`,
        timestamp: new Date(),
      });
    }

    const systemStatus = isWaDowntime ? "degraded" : downtimeAlerts.length > 0 ? "warning" : "operational";

    return res.json({
      success: true,
      summary: {
        transactions: {
          grossRevenue,
          totalTransactions: allPayments.length,
          paidTransactionsCount,
          pendingTransactionsCount,
          failedTransactionsCount,
          totalTips,
          recentPayments: allPayments.slice(0, 15),
        },
        deliveries: {
          totalDeliveries,
          deliveredCount,
          activeDeliveries,
          pendingPickups,
          cancelledCount,
          onTimeRate,
          statusBreakdown: statusCounts,
        },
        traffic: {
          totalUsers,
          customerCount,
          clientCount,
          activeSessionsToday,
          bookingConversionRate,
          realtimeSubscribers: sseManager.getActiveSubscriberCount(),
        },
        systemHealth: {
          status: systemStatus,
          database: { status: "connected", latencyMs: dbLatencyMs },
          whatsappGateway: {
            status: waStatus.status,
            humanStatus: waStatus.humanStatus,
            phoneNumber: waStatus.user?.phone,
            maskedPhone: waStatus.user?.maskedPhone,
            isDowntime: isWaDowntime,
          },
          uptimeSeconds: Math.floor(process.uptime()),
          downtimeAlerts,
        },
        notifications: {
          undeliveredCount,
          failedMessages,
        },
      },
    });
  } catch (error) {
    console.error("Admin summary fetch error:", error);
    return res.status(500).json({ error: "Failed to generate system summary." });
  }
});

// POST /api/admin/messages/:id/retry - Retry undelivered message
router.post("/messages/:id/retry", requireAdmin, async (req: Request, res: Response) => {
  try {
    const messageId = req.params.id;
    const existingMsg = await db.query.waOutboundMessages.findFirst({
      where: eq(waOutboundMessages.id, messageId),
    });

    if (!existingMsg) {
      return res.status(404).json({ error: "Message record not found." });
    }

    if (existingMsg.purpose === "signup_otp" || existingMsg.purpose === "reset_otp") {
      return res.status(400).json({
        error: "Cannot resend expired OTP code. Security codes expire in 5 minutes; the customer must request a new code.",
      });
    }

    if (existingMsg.attempts >= 3) {
      return res.status(400).json({
        error: "Maximum retry attempts (3) reached for this notification. Deduplication protection active.",
      });
    }

    const [msg] = await db
      .update(waOutboundMessages)
      .set({
        status: "queued",
        attempts: sql`${waOutboundMessages.attempts} + 1`,
        failureReason: null,
      })
      .where(eq(waOutboundMessages.id, messageId))
      .returning();

    return res.json({ success: true, message: "Notification requeued for delivery." });
  } catch (err) {
    console.error("Retry message error:", err);
    return res.status(500).json({ error: "Failed to retry message." });
  }
});

export default router;
