import { pool } from "../src/db";

async function runMigration() {
  console.log("Running Phase 1 Catalog Schema Migration...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Alter price_catalog category column to text for dynamic categories
    await client.query(`
      ALTER TABLE price_catalog ALTER COLUMN category TYPE text;
    `);

    // 2. Add upgraded catalog columns
    await client.query(`
      ALTER TABLE price_catalog 
        ADD COLUMN IF NOT EXISTS size_label text,
        ADD COLUMN IF NOT EXISTS image_url text,
        ADD COLUMN IF NOT EXISTS image_alt text,
        ADD COLUMN IF NOT EXISTS badge text,
        ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS category_description text,
        ADD COLUMN IF NOT EXISTS effective_from timestamp with time zone,
        ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();
    `);

    // 3. Create catalog_versions table for instant revalidation and cache tags
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_versions (
        id integer PRIMARY KEY DEFAULT 1,
        version integer NOT NULL DEFAULT 1,
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
      INSERT INTO catalog_versions (id, version, updated_at) 
      VALUES (1, 1, now()) 
      ON CONFLICT (id) DO NOTHING;
    `);

    // 4. Add snapshot columns to booking_items
    await client.query(`
      ALTER TABLE booking_items 
        ADD COLUMN IF NOT EXISTS variant_snapshot text,
        ADD COLUMN IF NOT EXISTS category_snapshot text;
    `);

    // 5. Add catalog_version to bookings table
    await client.query(`
      ALTER TABLE bookings 
        ADD COLUMN IF NOT EXISTS catalog_version integer DEFAULT 1;
    `);

    // 6. Populate default display order, size labels, badges and category descriptions for existing items
    await client.query(`
      UPDATE price_catalog 
      SET 
        display_order = 1,
        size_label = 'Up to 7 kg',
        badge = 'Popular',
        category_description = 'Everyday wearable clothes washed individually, tumble-dried and folded crisp.'
      WHERE variant ILIKE '%Small Basket%';

      UPDATE price_catalog 
      SET 
        display_order = 2,
        size_label = 'Up to 15 kg',
        category_description = 'Everyday wearable clothes washed individually, tumble-dried and folded crisp.'
      WHERE variant ILIKE '%Large Basket%';

      UPDATE price_catalog 
      SET 
        display_order = 3,
        size_label = '3x5 ft bed',
        category_description = 'Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.'
      WHERE variant ILIKE '%Single%Duvet%';

      UPDATE price_catalog 
      SET 
        display_order = 4,
        size_label = '4x6 ft bed',
        badge = 'Popular',
        category_description = 'Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.'
      WHERE variant ILIKE '%Medium%Duvet%';

      UPDATE price_catalog 
      SET 
        display_order = 5,
        size_label = '5x6 ft bed',
        category_description = 'Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.'
      WHERE variant ILIKE '%Queen%Duvet%';

      UPDATE price_catalog 
      SET 
        display_order = 6,
        size_label = '6x6 ft bed',
        category_description = 'Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.'
      WHERE variant ILIKE '%King%Duvet%';

      UPDATE price_catalog 
      SET 
        display_order = 7,
        size_label = 'Up to 2x3 ft',
        category_description = 'Rotary shampoo and power extraction for entrance, bathroom and area rugs.'
      WHERE variant ILIKE '%Small Doormat%';

      UPDATE price_catalog 
      SET 
        display_order = 8,
        size_label = 'Up to 4x4 ft',
        category_description = 'Rotary shampoo and power extraction for entrance, bathroom and area rugs.'
      WHERE variant ILIKE '%Medium Floor Mat%';

      UPDATE price_catalog 
      SET 
        display_order = 9,
        size_label = 'Up to 6x9 ft',
        category_description = 'Rotary shampoo and power extraction for entrance, bathroom and area rugs.'
      WHERE variant ILIKE '%Large Area Mat%';
    `);

    // Backfill existing booking_items variant_snapshot and category_snapshot from price_catalog
    await client.query(`
      UPDATE booking_items bi
      SET 
        variant_snapshot = COALESCE(bi.variant_snapshot, pc.variant),
        category_snapshot = COALESCE(bi.category_snapshot, pc.category)
      FROM price_catalog pc
      WHERE bi.catalog_id = pc.id AND bi.variant_snapshot IS NULL;
    `);

    await client.query("COMMIT");
    console.log("Phase 1 Catalog Migration completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
