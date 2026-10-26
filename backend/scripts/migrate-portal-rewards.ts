import { pool } from "../src/db";

async function runMigration() {
  console.log("🚀 Starting Client Portal, Loyalty & Vouchers Migration...");
  const client = await pool.connect();
  try {
    // 1. Enums (must be outside transaction or handle duplicate)
    console.log("1. Creating custom enums...");
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE voucher_source AS ENUM ('referral', 'loyalty', 'admin_grant');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE voucher_status AS ENUM ('available', 'reserved', 'redeemed', 'expired', 'voided');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query("BEGIN");

    console.log("2. Updating users table with client settings & blind index...");
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS whatsapp_notifications BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS phone_blind_index TEXT UNIQUE;
    `);

    console.log("3. Creating vouchers table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        source voucher_source NOT NULL,
        status voucher_status NOT NULL DEFAULT 'available',
        cap_definition TEXT NOT NULL DEFAULT 'small_basket',
        max_discount_kes INTEGER NOT NULL DEFAULT 300,
        created_from_event_id TEXT,
        redeemed_order_id UUID,
        expires_at TIMESTAMPTZ NOT NULL,
        redeemed_at TIMESTAMPTZ,
        void_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS vouchers_client_idx ON vouchers(client_id, status);
      CREATE INDEX IF NOT EXISTS vouchers_status_expires_idx ON vouchers(status, expires_at);
      CREATE UNIQUE INDEX IF NOT EXISTS vouchers_code_idx ON vouchers(code);
    `);

    console.log("4. Updating bookings table for vouchers and discounts...");
    await client.query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
    `);

    // Add foreign key constraint from vouchers.redeemed_order_id to bookings.id
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE vouchers
        ADD CONSTRAINT vouchers_redeemed_order_fk
        FOREIGN KEY (redeemed_order_id) REFERENCES bookings(id) ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("5. Creating loyalty_ledger table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS loyalty_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
        cycle_number INTEGER NOT NULL DEFAULT 1,
        wash_number INTEGER NOT NULL,
        voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS loyalty_ledger_user_cycle_idx ON loyalty_ledger(user_id, cycle_number);
    `);

    console.log("6. Updating referrals table with lifecycle columns...");
    await client.query(`
      ALTER TABLE referrals
      ADD COLUMN IF NOT EXISTS void_reason TEXT,
      ADD COLUMN IF NOT EXISTS flag_signals JSONB,
      ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reward_voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL;
    `);

    console.log("7. Creating referral_events table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        notes TEXT,
        meta JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS referral_events_referral_idx ON referral_events(referral_id, created_at);
    `);

    console.log("8. Creating program_settings table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_settings (
        version INTEGER PRIMARY KEY,
        referral_threshold INTEGER NOT NULL DEFAULT 5,
        loyalty_threshold INTEGER NOT NULL DEFAULT 7,
        min_order_value_kes INTEGER NOT NULL DEFAULT 1000,
        small_basket_price_kes INTEGER NOT NULL DEFAULT 300,
        voucher_validity_days INTEGER NOT NULL DEFAULT 30,
        hold_window_hours INTEGER NOT NULL DEFAULT 0,
        active_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL
      );

      INSERT INTO program_settings (
        version, referral_threshold, loyalty_threshold, min_order_value_kes,
        small_basket_price_kes, voucher_validity_days, hold_window_hours
      ) VALUES (1, 5, 7, 1000, 300, 30, 0)
      ON CONFLICT (version) DO NOTHING;
    `);

    console.log("9. Creating client_encryption_keys table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_encryption_keys (
        client_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        encrypted_dek TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        key_version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        rotated_at TIMESTAMPTZ
      );
    `);

    await client.query("COMMIT");
    console.log("✅ Client Portal and Rewards schema migration committed successfully!");
    process.exit(0);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
