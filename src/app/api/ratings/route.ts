import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ratings, bookings, auditLog } from "@/db/schema";
import { getSession } from "@/lib/session";
import { sanitizeText } from "@/lib/sanitization";
import { broadcastAdminEvent } from "@/lib/sse";
import { eq } from "drizzle-orm";

const ratingSchema = z.object({
  bookingId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parseResult = ratingSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid rating submission", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { bookingId, stars, comment } = parseResult.data;

    // Fetch booking
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Must be owner or admin
    if (session.role !== "admin" && booking.customerId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if already rated
    const existingRating = await db.query.ratings.findFirst({
      where: eq(ratings.bookingId, bookingId),
    });

    if (existingRating) {
      return NextResponse.json(
        { error: "This booking has already been rated." },
        { status: 409 }
      );
    }

    const cleanComment = sanitizeText(comment) || null;

    const [createdRating] = await db
      .insert(ratings)
      .values({
        bookingId,
        stars,
        comment: cleanComment,
      })
      .returning();

    // Audit Log
    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "RATING_SUBMITTED",
      entity: "ratings",
      entityId: createdRating.id,
      meta: { bookingId, stars },
    });

    // Broadcast SSE to admin
    broadcastAdminEvent("RATING_RECEIVED", {
      bookingId,
      stars,
      comment: cleanComment,
    });

    return NextResponse.json({
      success: true,
      rating: createdRating,
    });
  } catch (error) {
    console.error("Rating submission error:", error);
    return NextResponse.json({ error: "Failed to submit rating." }, { status: 500 });
  }
}
