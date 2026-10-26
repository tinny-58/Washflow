import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { bookings, ratings, auditLog, addresses, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { verifyOrderAccessToken, revokeOrderAccessToken } from "../lib/tokens/access-tokens";
import { sanitizeText } from "../lib/sanitization";
import { checkRateLimit } from "../lib/rate-limiter";
import { broadcastAdminEvent } from "../lib/sse";
import { awardReviewCommentPoints } from "../lib/rewards";

const router = Router();

// Helper to extract client IP for rate limiting
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "127.0.0.1";
}

// 1. GET /api/track/:token - Public safe order tracking (No customer phone or full address)
router.get("/track/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const clientIp = getClientIp(req);

  // Rate limiting on public token verification: 60 queries/min per IP
  const rateLimit = await checkRateLimit(`ratelimit:track:${clientIp}`, 60, 60);
  if (!rateLimit.success) {
    return res.status(429).json({ error: "Too many tracking requests. Please slow down." });
  }

  const tokenVerification = await verifyOrderAccessToken(token, "track");
  if (!tokenVerification.valid || !tokenVerification.bookingId) {
    return res.status(404).json({ error: tokenVerification.error || "Order tracking link is invalid or expired." });
  }

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, tokenVerification.bookingId),
    with: {
      items: {
        with: {
          catalogItem: true,
        },
      },
      address: true,
      customer: true,
    },
  });

  if (!booking) {
    return res.status(404).json({ error: "Order details not found." });
  }

  // Sanitize data: Zero PII disclosure
  // Only reveal first name, area/neighborhood, and item counts/variants
  const customerFirstName = booking.customer?.name?.split(" ")[0] || "Customer";
  const generalArea = booking.address?.addressText
    ? booking.address.addressText.split(",")[0]
    : "Nairobi Metro Area";

  return res.json({
    success: true,
    tracking: {
      orderId: booking.id.slice(0, 8),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      pickupWindow: booking.pickupWindow,
      total: booking.total,
      subtotal: booking.subtotal,
      createdAt: booking.createdAt,
      estimatedDeliveryAt: booking.estimatedDeliveryAt,
      customerFirstName,
      generalArea,
      landmark: booking.address?.landmark || undefined,
      items: booking.items.map((item: any) => ({
        id: item.id,
        category: item.catalogItem?.category || "basket",
        variant: item.catalogItem?.variant || "Item",
        qty: item.qty,
        unitPrice: item.unitPriceSnapshot,
        subtotal: item.qty * item.unitPriceSnapshot,
      })),
    },
  });
});

// 2. POST /api/rate/:token - Public rating submission via scoped 128-bit token
const submitRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

router.post("/rate/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const clientIp = getClientIp(req);

  const rateLimit = await checkRateLimit(`ratelimit:rate:${clientIp}`, 10, 60);
  if (!rateLimit.success) {
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }

  const tokenVerification = await verifyOrderAccessToken(token, "rate");
  if (!tokenVerification.valid || !tokenVerification.bookingId) {
    return res.status(404).json({ error: tokenVerification.error || "Rating link is invalid or expired." });
  }

  const parsed = submitRatingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid rating submission", details: parsed.error.flatten() });
  }

  const { stars, comment } = parsed.data;
  const bookingId = tokenVerification.bookingId;

  const existingRating = await db.query.ratings.findFirst({
    where: eq(ratings.bookingId, bookingId),
  });

  if (existingRating) {
    return res.status(409).json({ error: "This laundry order has already been rated. Thank you!" });
  }

  const cleanComment = comment ? sanitizeText(comment) : null;

  const [createdRating] = await db
    .insert(ratings)
    .values({
      bookingId,
      stars,
      comment: cleanComment,
    })
    .returning();

  // Revoke token immediately after single use
  await revokeOrderAccessToken(token);

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
  });

  if (booking?.customerId) {
    awardReviewCommentPoints(bookingId, booking.customerId, cleanComment).catch((err: any) =>
      console.error("[Rewards] Failed to award rating points:", err)
    );
  }

  await db.insert(auditLog).values({
    action: "RATING_SUBMITTED_VIA_TOKEN",
    entity: "ratings",
    entityId: createdRating.id,
    meta: { bookingId, stars, hasComment: Boolean(cleanComment) },
  });

  broadcastAdminEvent("RATING_RECEIVED", {
    bookingId,
    stars,
    comment: cleanComment,
  });

  return res.json({
    success: true,
    rating: createdRating,
    message: "Thank you for your rating!",
  });
});

export default router;
