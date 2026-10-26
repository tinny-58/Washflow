import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { ratings, bookings, auditLog } from "../db/schema";
import { getSessionFromReq } from "../lib/session";
import { sanitizeText } from "../lib/sanitization";
import { broadcastAdminEvent } from "../lib/sse";
import { awardReviewCommentPoints } from "../lib/rewards";
import { eq } from "drizzle-orm";

const router = Router();

const ratingSchema = z.object({
  bookingId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

// POST /api/ratings
router.post("/", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parseResult = ratingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid rating submission",
        details: parseResult.error.flatten(),
      });
    }

    const { bookingId, stars, comment } = parseResult.data;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (session.role !== "admin" && booking.customerId !== session.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const existingRating = await db.query.ratings.findFirst({
      where: eq(ratings.bookingId, bookingId),
    });

    if (existingRating) {
      return res.status(409).json({ error: "This booking has already been rated." });
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

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "RATING_SUBMITTED",
      entity: "ratings",
      entityId: createdRating.id,
      meta: { bookingId, stars, comment: cleanComment },
    });

    broadcastAdminEvent("RATING_RECEIVED", {
      bookingId,
      stars,
      comment: cleanComment,
    });

    // Award Points for Review / Comment
    awardReviewCommentPoints(bookingId, session.userId, cleanComment).catch((err: any) =>
      console.error("[Rewards] Failed to award rating points:", err)
    );

    return res.json({
      success: true,
      rating: createdRating,
    });
  } catch (error) {
    console.error("Rating submission error:", error);
    return res.status(500).json({ error: "Failed to submit rating." });
  }
});

export default router;
