import { pool } from "../src/db";

async function migrate() {
  console.log("Starting Rewards, Referrals, Notifications & Live Ping migration...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Update users table
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS reward_points_balance INTEGER NOT NULL DEFAULT 0;
    `);

    // 2. Create referrals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        referrer_points_awarded INTEGER NOT NULL DEFAULT 0,
        referee_points_awarded INTEGER NOT NULL DEFAULT 0,
        qualifying_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        CONSTRAINT unique_referred_user UNIQUE (referred_user_id)
      );
      CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_id);
      CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals(status);
    `);

    // 3. Create reward_points_ledger table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reward_points_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        reference_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS reward_points_ledger_user_idx ON reward_points_ledger(user_id);
      CREATE INDEX IF NOT EXISTS reward_points_ledger_created_idx ON reward_points_ledger(created_at);
    `);

    // 4. Update notifications table
    await client.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS title TEXT,
      ADD COLUMN IF NOT EXISTS message TEXT,
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS link TEXT;
      CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
    `);

    // 5. Update bookings table for rider GPS ping and delivery time tracking
    await client.query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rider_ping_lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS rider_ping_lng DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS rider_ping_address TEXT,
      ADD COLUMN IF NOT EXISTS rider_ping_notes TEXT,
      ADD COLUMN IF NOT EXISTS rider_ping_accuracy DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS rider_location_pinged_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS free_wash_redeemed BOOLEAN NOT NULL DEFAULT false;
    `);

    // 6. Backfill referral codes for existing users without one
    const usersWithoutCode = await client.query(`
      SELECT id, name, username, phone FROM users WHERE referral_code IS NULL
    `);

    for (const u of usersWithoutCode.rows) {
      const prefix = (u.username || u.name || "WASH")
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 4)
        .toUpperCase();
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const generatedCode = `WF-${prefix || "WASH"}${randomSuffix}`;
      
      await client.query(`
        UPDATE users 
        SET referral_code = $1 
        WHERE id = $2 AND referral_code IS NULL
      `, [generatedCode, u.id]);
    }

    await client.query("COMMIT");
    console.log("Migration completed successfully! All tables and backfills ready.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
