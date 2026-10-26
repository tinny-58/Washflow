import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import crypto from "crypto";

const REVALIDATE_SECRET =
  process.env.REVALIDATE_SECRET || "washflow_internal_revalidate_secret_key_2026";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Simple in-memory rate limiting: at most 1 revalidation per 500ms per origin
let lastRevalidationTime = 0;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("x-revalidate-secret") || "";

    if (!authHeader || !timingSafeEqual(authHeader, REVALIDATE_SECRET)) {
      return NextResponse.json(
        { error: "Unauthorized revalidation request" },
        { status: 401 }
      );
    }

    const now = Date.now();
    if (now - lastRevalidationTime < 500) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }
    lastRevalidationTime = now;

    // Purge ISR caches
    revalidateTag("catalog");
    revalidatePath("/prices");
    revalidatePath("/book");

    return NextResponse.json({
      revalidated: true,
      timestamp: now,
      tags: ["catalog"],
      paths: ["/prices", "/book"],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Revalidation failed", details: error.message },
      { status: 500 }
    );
  }
}
