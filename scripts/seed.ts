import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { pool, db } from "../src/db";
import { users, priceCatalog, auditLog } from "../src/db/schema";
import { initialCatalog } from "../src/db/seed-data";
import argon2 from "argon2";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🌱 Starting WashFlow database seeding...");

  try {
    // 1. Seed Admin User
    const adminEmail = process.env.ADMIN_EMAIL || "admin@washflow.co.ke";
    const adminPhone = process.env.ADMIN_PHONE || "+254700000000";
    const adminPassword = process.env.ADMIN_PASSWORD || "WashFlow#Admin2026!Secure";
    const adminName = process.env.ADMIN_NAME || "WashFlow Operations";

    const existingAdmin = await db.query.users.findFirst({
      where: (u, { or, eq }) => or(eq(u.email, adminEmail), eq(u.phone, adminPhone)),
    });

    if (!existingAdmin) {
      console.log(`👤 Seeding admin user: ${adminEmail}`);
      const passwordHash = await argon2.hash(adminPassword);
      const [newAdmin] = await db
        .insert(users)
        .values({
          name: adminName,
          email: adminEmail,
          phone: adminPhone,
          passwordHash,
          role: "admin",
          phoneVerifiedAt: new Date(),
        })
        .returning();

      await db.insert(auditLog).values({
        actorId: newAdmin.id,
        action: "SEED_ADMIN_CREATED",
        entity: "users",
        entityId: newAdmin.id,
        meta: { email: adminEmail },
      });
      console.log("✅ Admin user seeded successfully.");
    } else {
      console.log(`ℹ️ Admin user already exists (id: ${existingAdmin.id}). Skipping.`);
    }

    // 2. Seed Price Catalog
    console.log("🏷️ Seeding price catalog...");
    for (const item of initialCatalog) {
      const existingItem = await db.query.priceCatalog.findFirst({
        where: (c, { and, eq }) => and(eq(c.category, item.category), eq(c.variant, item.variant)),
      });

      if (!existingItem) {
        await db.insert(priceCatalog).values({
          category: item.category,
          variant: item.variant,
          price: item.price,
          active: item.active,
          description: item.description,
        });
        console.log(`   + Added [${item.category}] ${item.variant} @ KES ${item.price}`);
      } else {
        console.log(`   = [${item.category}] ${item.variant} exists @ KES ${existingItem.price}`);
      }
    }

    console.log("🎉 Database seeding complete!");
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
