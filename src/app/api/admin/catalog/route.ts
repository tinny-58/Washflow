import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { priceCatalog, auditLog } from "@/db/schema";
import { requireAdminSession } from "@/lib/session";
import { sanitizeText } from "@/lib/sanitization";
import { eq, desc } from "drizzle-orm";

const createCatalogItemSchema = z.object({
  category: z.enum(["basket", "mat", "duvet"]),
  variant: z.string().min(2).max(100),
  price: z.number().int().min(50).max(100000),
  description: z.string().max(255).optional(),
});

const updateCatalogItemSchema = z.object({
  id: z.string().uuid(),
  price: z.number().int().min(50).max(100000).optional(),
  variant: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireAdminSession();
    const items = await db.select().from(priceCatalog).orderBy(desc(priceCatalog.createdAt));
    return NextResponse.json({ success: true, items });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminSession = await requireAdminSession();
    const rawBody = await req.json();
    const parseResult = createCatalogItemSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid item data", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { category, variant, price, description } = parseResult.data;

    const [newItem] = await db
      .insert(priceCatalog)
      .values({
        category,
        variant: sanitizeText(variant),
        price,
        description: sanitizeText(description) || null,
        active: true,
      })
      .returning();

    await db.insert(auditLog).values({
      actorId: adminSession.userId,
      action: "CATALOG_ITEM_CREATED",
      entity: "price_catalog",
      entityId: newItem.id,
      meta: { category, variant, price },
    });

    return NextResponse.json({ success: true, item: newItem });
  } catch (error) {
    console.error("Create catalog item error:", error);
    return NextResponse.json({ error: "Failed to create catalog item." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminSession = await requireAdminSession();
    const rawBody = await req.json();
    const parseResult = updateCatalogItemSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid update data", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { id, price, variant, description, active } = parseResult.data;

    const updateFields: Record<string, unknown> = {};
    if (price !== undefined) updateFields.price = price;
    if (variant !== undefined) updateFields.variant = sanitizeText(variant);
    if (description !== undefined) updateFields.description = sanitizeText(description);
    if (active !== undefined) updateFields.active = active;

    const [updatedItem] = await db
      .update(priceCatalog)
      .set(updateFields)
      .where(eq(priceCatalog.id, id))
      .returning();

    await db.insert(auditLog).values({
      actorId: adminSession.userId,
      action: "CATALOG_ITEM_UPDATED",
      entity: "price_catalog",
      entityId: id,
      meta: updateFields,
    });

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error("Update catalog item error:", error);
    return NextResponse.json({ error: "Failed to update catalog item." }, { status: 500 });
  }
}
