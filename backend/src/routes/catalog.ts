import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import { priceCatalog, catalogVersions, programSettings } from "../db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { getDynamicSmallBasketCap } from "../services/catalog-revalidation";

const router = Router();

// GET /api/catalog - Public, GET-only, strictly allowlisted DTO
router.get("/", async (req: Request, res: Response) => {
  try {
    // 1. Fetch active catalog items ordered by display_order then price
    const rows = await db
      .select({
        id: priceCatalog.id,
        category: priceCatalog.category,
        variant: priceCatalog.variant,
        price: priceCatalog.price,
        description: priceCatalog.description,
        sizeLabel: priceCatalog.sizeLabel,
        imageUrl: priceCatalog.imageUrl,
        imageAlt: priceCatalog.imageAlt,
        badge: priceCatalog.badge,
        displayOrder: priceCatalog.displayOrder,
        categoryDescription: priceCatalog.categoryDescription,
        updatedAt: priceCatalog.updatedAt,
      })
      .from(priceCatalog)
      .where(eq(priceCatalog.active, true))
      .orderBy(asc(priceCatalog.displayOrder), asc(priceCatalog.price));

    // 2. Fetch current catalog version and last updated timestamp
    const [versionRow] = await db
      .select()
      .from(catalogVersions)
      .where(eq(catalogVersions.id, 1))
      .limit(1);

    const catalogVersion = versionRow?.version || 1;
    
    // Find latest update time across items or version row
    let lastUpdated = versionRow?.updatedAt || new Date();
    for (const item of rows) {
      if (item.updatedAt && item.updatedAt > lastUpdated) {
        lastUpdated = item.updatedAt;
      }
    }

    // 3. Build dynamic unique categories with friendly labels and descriptions
    const categoryMap = new Map<string, { id: string; label: string; description?: string | null; count: number }>();
    for (const item of rows) {
      const catKey = item.category.toLowerCase().trim();
      const existing = categoryMap.get(catKey);
      if (!existing) {
        // Create capitalized label (e.g., "basket" -> "Baskets", "duvet" -> "Duvets", "mat" -> "Floor Mats")
        let label = catKey.charAt(0).toUpperCase() + catKey.slice(1);
        if (catKey === "basket") label = "Baskets (Everyday)";
        else if (catKey === "duvet") label = "Duvets & Bedding";
        else if (catKey === "mat") label = "Floor & Area Mats";
        else if (!label.endsWith("s")) label += "s";

        categoryMap.set(catKey, {
          id: catKey,
          label,
          description: item.categoryDescription || null,
          count: 1,
        });
      } else {
        existing.count += 1;
        if (!existing.description && item.categoryDescription) {
          existing.description = item.categoryDescription;
        }
      }
    }

    const categories = Array.from(categoryMap.values());

    // 4. Fetch versioned program settings and dynamic small basket cap
    const [latestSettings] = await db
      .select()
      .from(programSettings)
      .orderBy(desc(programSettings.version))
      .limit(1);

    const smallBasketCap = await getDynamicSmallBasketCap();

    const programRules = {
      referralThreshold: latestSettings?.referralThreshold ?? 5,
      loyaltyThreshold: latestSettings?.loyaltyThreshold ?? 7,
      smallBasketPriceKes: smallBasketCap.price,
      smallBasketVariant: smallBasketCap.variant,
      voucherValidityDays: latestSettings?.voucherValidityDays ?? 30,
    };

    const responsePayload = {
      success: true,
      catalogVersion,
      lastUpdated: lastUpdated.toISOString(),
      categories,
      items: rows,
      programRules,
    };

    // 4. Compute ETag for caching
    const payloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(responsePayload))
      .digest("hex")
      .slice(0, 16);
    const etag = `W/"${catalogVersion}-${payloadHash}"`;

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    res.setHeader("ETag", etag);

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error("Fetch catalog error:", error);
    return res.status(500).json({ error: "Failed to load price catalog." });
  }
});

export default router;
