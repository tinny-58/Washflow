import { pool } from "../src/db";

async function runPhase3Migration() {
  console.log("🚀 Starting Phase 3 Booking, Slots, Series & Settings Migration...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    // 1. System Settings Table (Versioned configuration)
    console.log("1. Creating system_settings table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        booking_deposit_minor INTEGER NOT NULL DEFAULT 5000,
        cancellation_cutoff_minutes INTEGER NOT NULL DEFAULT 120,
        recurring_max_horizon_days INTEGER NOT NULL DEFAULT 90,
        recurring_max_occurrences INTEGER NOT NULL DEFAULT 12,
        default_window_capacity INTEGER NOT NULL DEFAULT 10,
        min_lead_time_hours INTEGER NOT NULL DEFAULT 3,
        window_booking_cutoff_hours INTEGER NOT NULL DEFAULT 1,
        slot_hold_duration_minutes INTEGER NOT NULL DEFAULT 10,
        max_concurrent_unpaid_holds INTEGER NOT NULL DEFAULT 2,
        claim_window_hours INTEGER NOT NULL DEFAULT 72,
        claim_sla_first_response_hours INTEGER NOT NULL DEFAULT 24,
        claim_sla_resolution_hours INTEGER NOT NULL DEFAULT 48,
        username_change_cooldown_days INTEGER NOT NULL DEFAULT 60,
        closed_days_of_week JSONB NOT NULL DEFAULT '[0]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed default settings row if not present
    await client.query(`
      INSERT INTO system_settings (
        id, version, booking_deposit_minor, cancellation_cutoff_minutes,
        recurring_max_horizon_days, recurring_max_occurrences, default_window_capacity,
        min_lead_time_hours, window_booking_cutoff_hours, slot_hold_duration_minutes,
        max_concurrent_unpaid_holds, claim_window_hours, claim_sla_first_response_hours,
        claim_sla_resolution_hours, username_change_cooldown_days, closed_days_of_week
      )
      VALUES (
        1, 1, 5000, 120, 90, 12, 10, 3, 1, 10, 2, 72, 24, 48, 60, '[0]'::jsonb
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✓ system_settings ready");

    // 2. Slot Capacity Table
    console.log("2. Creating slot_capacity table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS slot_capacity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date TEXT NOT NULL,
        window_id TEXT NOT NULL,
        window_label TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 10,
        reserved INTEGER NOT NULL DEFAULT 0,
        held INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'available',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT slot_capacity_date_window_unique UNIQUE (date, window_id)
      );

      CREATE INDEX IF NOT EXISTS slot_capacity_date_idx ON slot_capacity (date);
      CREATE INDEX IF NOT EXISTS slot_capacity_status_idx ON slot_capacity (status);
    `);
    console.log("✓ slot_capacity ready");

    // 3. Booking Series Table
    console.log("3. Creating booking_series table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_series (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        address_id UUID NOT NULL REFERENCES addresses(id),
        frequency TEXT NOT NULL,
        rule JSONB NOT NULL,
        catalog_version INTEGER NOT NULL DEFAULT 1,
        total_occurrences INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS booking_series_client_idx ON booking_series (client_id, status);
    `);
    console.log("✓ booking_series ready");

    // 4. Booking Occurrences Table
    console.log("4. Creating booking_occurrences table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_occurrences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        series_id UUID NOT NULL REFERENCES booking_series(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        occurrence_index INTEGER NOT NULL DEFAULT 1,
        occurrence_date TEXT NOT NULL,
        window_id TEXT NOT NULL,
        slot_id UUID REFERENCES slot_capacity(id) ON DELETE SET NULL,
        booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        deposit_amount_minor INTEGER NOT NULL DEFAULT 5000,
        deposit_paid BOOLEAN NOT NULL DEFAULT false,
        deposit_paid_at TIMESTAMPTZ,
        price_locked_minor INTEGER NOT NULL,
        catalog_snapshot JSONB NOT NULL,
        reminded_48h_at TIMESTAMPTZ,
        reminded_24h_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT booking_occurrences_series_date_unique UNIQUE (series_id, occurrence_date)
      );

      CREATE INDEX IF NOT EXISTS booking_occurrences_client_idx ON booking_occurrences (client_id, status);
      CREATE INDEX IF NOT EXISTS booking_occurrences_date_idx ON booking_occurrences (occurrence_date, status);
    `);
    console.log("✓ booking_occurrences ready");

    // 5. Slot Holds Table (Atomic 10-minute slot hold)
    console.log("5. Creating slot_holds table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS slot_holds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_id UUID NOT NULL REFERENCES slot_capacity(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        series_id UUID REFERENCES booking_series(id) ON DELETE SET NULL,
        occurrence_date TEXT NOT NULL,
        window_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'held',
        held_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        released_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ,
        booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS slot_holds_client_active_idx ON slot_holds (client_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS slot_holds_slot_idx ON slot_holds (slot_id, status);
    `);
    console.log("✓ slot_holds ready");

    // 6. Update Bookings table with recurring linkage and deposit minor units
    console.log("6. Updating bookings table...");
    await client.query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES booking_series(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES booking_occurrences(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS deposit_minor INTEGER NOT NULL DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS balance_minor INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;

      CREATE INDEX IF NOT EXISTS bookings_series_idx ON bookings (series_id);
    `);
    console.log("✓ bookings table updated");

    // 7. Enable RLS on newly created tables
    console.log("7. Configuring Row-Level Security policies...");
    const tenantTables = [
      { name: "slot_holds", clientCol: "client_id" },
      { name: "booking_series", clientCol: "client_id" },
      { name: "booking_occurrences", clientCol: "client_id" },
    ];

    for (const table of tenantTables) {
      await client.query(`ALTER TABLE "${table.name}" ENABLE ROW LEVEL SECURITY;`);
      await client.query(`ALTER TABLE "${table.name}" FORCE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table.name}";`);
      await client.query(`
        CREATE POLICY "tenant_isolation_policy" ON "${table.name}"
        FOR ALL
        TO my_app
        USING (
          ${table.clientCol} = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          OR current_setting('app.is_admin', true) = 'true'
        )
        WITH CHECK (
          ${table.clientCol} = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          OR current_setting('app.is_admin', true) = 'true'
        );
      `);
      console.log(`✓ RLS configured on ${table.name}`);
    }

    // Public read for slot_capacity & system_settings for my_app
    await client.query(`
      ALTER TABLE "slot_capacity" ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "slot_capacity_read_policy" ON "slot_capacity";
      CREATE POLICY "slot_capacity_read_policy" ON "slot_capacity"
      FOR SELECT TO my_app USING (true);

      ALTER TABLE "system_settings" ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "system_settings_read_policy" ON "system_settings";
      CREATE POLICY "system_settings_read_policy" ON "system_settings"
      FOR SELECT TO my_app USING (true);
    `);

    await client.query("COMMIT;");
    console.log("🎉 Phase 3 Database Migration Successfully Applied!");
  } catch (error) {
    await client.query("ROLLBACK;");
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runPhase3Migration();
