import { eq, sql, desc, and, lte } from "drizzle-orm";
import { db } from "../db";
import { priceCatalog, catalogVersions, auditLog, catalogOutboxEvents } from "../db/schema";
import crypto from "crypto";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const REVALIDATE_SECRET =
  process.env.REVALIDATE_SECRET || "washflow_internal_revalidate_secret_key_2026";

/**
 * Triggers Next.js on-demand ISR cache revalidation
 */
export async function triggerRevalidation(meta?: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${FRONTEND_URL}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": REVALIDATE_SECRET,
      },
      body: JSON.stringify(meta || {}),
    });

    if (res.ok) {
      return true;
    } else {
      console.warn(`[Revalidation] Next.js returned status ${res.status}`);
      return false;
    }
  } catch (err: any) {
    console.warn(`[Revalidation] Failed to reach frontend revalidate route: ${err.message}`);
    return false;
  }
}

/**
 * Executes catalog item update or insert in ONE atomic transaction:
 * 1. Update/Insert price_catalog item (with optimistic version check)
 * 2. Bump catalog_versions table version
 * 3. Write before/after snapshot to audit_log
 * 4. Write catalog_outbox_events row
 * 5. Asynchronously dispatches Next.js revalidation
 */
export async function transactionalCatalogUpdate(params: {
  itemId?: string;
  actorId: string;
  data: {
    category?: string;
    variant?: string;
    price?: number;
    description?: string | null;
    sizeLabel?: string | null;
    imageUrl?: string | null;
    imageAlt?: string | null;
    badge?: string | null;
    displayOrder?: number;
    categoryDescription?: string | null;
    active?: boolean;
    effectiveFrom?: Date | null;
  };
  expectedVersion?: number;
}) {
  return await db.transaction(async (tx) => {
    let targetId = params.itemId;
    let oldItem: any = null;
    let newItem: any = null;

    if (targetId) {
      // Fetch current item for before snapshot and version check
      const [existing] = await tx
        .select()
        .from(priceCatalog)
        .where(eq(priceCatalog.id, targetId));

      if (!existing) {
        throw new Error("ITEM_NOT_FOUND");
      }

      // Optimistic concurrency check
      if (params.expectedVersion !== undefined && existing.version !== params.expectedVersion) {
        const err: any = new Error("CONCURRENCY_CONFLICT");
        err.currentVersion = existing.version;
        throw err;
      }

      oldItem = existing;

      // Update item
      const updateData: any = {
        ...params.data,
        version: existing.version + 1,
        updatedAt: new Date(),
      };

      const [updated] = await tx
        .update(priceCatalog)
        .set(updateData)
        .where(eq(priceCatalog.id, targetId))
        .returning();

      newItem = updated;
    } else {
      // Insert new item
      const [inserted] = await tx
        .insert(priceCatalog)
        .values({
          category: params.data.category || "basket",
          variant: params.data.variant || "New Service",
          price: params.data.price || 100,
          description: params.data.description,
          sizeLabel: params.data.sizeLabel,
          imageUrl: params.data.imageUrl,
          imageAlt: params.data.imageAlt,
          badge: params.data.badge,
          displayOrder: params.data.displayOrder || 0,
          categoryDescription: params.data.categoryDescription,
          active: params.data.active ?? true,
          effectiveFrom: params.data.effectiveFrom,
          version: 1,
        })
        .returning();

      targetId = inserted.id;
      newItem = inserted;
    }

    // 2. Increment global catalog_versions
    const [catVer] = await tx
      .update(catalogVersions)
      .set({
        version: sql`${catalogVersions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(catalogVersions.id, 1))
      .returning();

    const currentGlobalVer = catVer?.version ?? 1;

    // 3. Insert audit log
    await tx.insert(auditLog).values({
      actorId: params.actorId,
      action: oldItem ? "CATALOG_ITEM_UPDATED" : "CATALOG_ITEM_CREATED",
      entity: "price_catalog",
      entityId: targetId!,
      meta: {
        before: oldItem,
        after: newItem,
        catalogVersion: currentGlobalVer,
      },
    });

    // 4. Insert catalog outbox event
    const [outboxEvent] = await tx
      .insert(catalogOutboxEvents)
      .values({
        eventType: oldItem ? "CATALOG_ITEM_UPDATED" : "CATALOG_ITEM_CREATED",
        payload: {
          itemId: targetId,
          variant: newItem.variant,
          oldPrice: oldItem?.price,
          newPrice: newItem.price,
          catalogVersion: currentGlobalVer,
        },
        status: "pending",
        scheduledFor: params.data.effectiveFrom || new Date(),
      })
      .returning();

    return {
      item: newItem,
      catalogVersion: currentGlobalVer,
      outboxId: outboxEvent.id,
    };
  });
}

/**
 * Worker polling for pending revalidations with retry logic
 */
export async function processCatalogOutboxEvents() {
  const now = new Date();
  const pending = await db
    .select()
    .from(catalogOutboxEvents)
    .where(
      and(
        sql`${catalogOutboxEvents.status} IN ('pending', 'failed')`,
        lte(catalogOutboxEvents.scheduledFor, now),
        sql`${catalogOutboxEvents.attempts} < 5`
      )
    )
    .limit(10);

  for (const event of pending) {
    const success = await triggerRevalidation({
      eventId: event.id,
      eventType: event.eventType,
      payload: event.payload,
    });

    if (success) {
      await db
        .update(catalogOutboxEvents)
        .set({
          status: "processed",
          processedAt: new Date(),
        })
        .where(eq(catalogOutboxEvents.id, event.id));
    } else {
      const nextAttempts = event.attempts + 1;
      await db
        .update(catalogOutboxEvents)
        .set({
          status: nextAttempts >= 5 ? "abandoned" : "failed",
          attempts: nextAttempts,
          lastError: `Revalidation attempt ${nextAttempts} failed at ${new Date().toISOString()}`,
        })
        .where(eq(catalogOutboxEvents.id, event.id));

      if (nextAttempts >= 5) {
        console.error(
          `[CRITICAL ALERT] Catalog revalidation outbox event ${event.id} abandoned after 5 failed attempts!`
        );
      }
    }
  }
}

/**
 * Dynamic Small Basket Cap lookup for loyalty and referrals.
 * Always resolves dynamically from price_catalog item.
 */
export async function getDynamicSmallBasketCap(): Promise<{ id: string; variant: string; price: number }> {
  const [basket] = await db
    .select({
      id: priceCatalog.id,
      variant: priceCatalog.variant,
      price: priceCatalog.price,
    })
    .from(priceCatalog)
    .where(
      and(
        sql`(${priceCatalog.variant} ILIKE '%Small Basket%' OR ${priceCatalog.sizeLabel} ILIKE '%7 kg%')`,
        eq(priceCatalog.active, true)
      )
    )
    .orderBy(priceCatalog.displayOrder)
    .limit(1);

  if (basket) {
    return basket;
  }

  return {
    id: "00000000-0000-0000-0000-000000000001",
    variant: "Small Basket, up to 7 kg",
    price: 300,
  };
}
