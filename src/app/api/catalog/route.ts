import { NextResponse } from "next/server";
import { db } from "@/db";
import { priceCatalog } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  try {
    const items = await db
      .select()
      .from(priceCatalog)
      .where(eq(priceCatalog.active, true))
      .orderBy(asc(priceCatalog.category), asc(priceCatalog.price));

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error("Failed to fetch catalog:", error);
    return NextResponse.json({ error: "Failed to load price catalog." }, { status: 500 });
  }
}
