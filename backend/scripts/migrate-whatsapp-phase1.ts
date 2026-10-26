import { pool } from "../src/db";

export async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // 1. wa_automation_templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_automation_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        priority_class TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        template TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. wa_automation_template_history
    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_automation_template_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id TEXT NOT NULL REFERENCES wa_automation_templates(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        template TEXT NOT NULL,
        action TEXT NOT NULL,
        changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        change_summary TEXT
      );
      CREATE INDEX IF NOT EXISTS wa_template_history_idx ON wa_automation_template_history(template_id, version);
    `);

    // 3. order_access_tokens
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_access_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT NOT NULL UNIQUE,
        booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS order_access_tokens_token_idx ON order_access_tokens(token);
      CREATE INDEX IF NOT EXISTS order_access_tokens_booking_idx ON order_access_tokens(booking_id, purpose);
    `);

    // 4. Update wa_outbound_messages
    await client.query(`
      ALTER TABLE wa_outbound_messages 
        ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS automation_id TEXT,
        ADD COLUMN IF NOT EXISTS template_version INTEGER,
        ADD COLUMN IF NOT EXISTS rendered_body_masked TEXT,
        ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'transactional',
        ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
      
      CREATE INDEX IF NOT EXISTS wa_messages_scheduled_idx ON wa_outbound_messages(status, scheduled_for);
    `);

    // 5. traffic_events
    await client.query(`
      CREATE TABLE IF NOT EXISTS traffic_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        visitor_hash TEXT NOT NULL,
        customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id TEXT,
        event_type TEXT NOT NULL,
        path TEXT NOT NULL,
        referrer_type TEXT NOT NULL DEFAULT 'direct',
        campaign_source TEXT,
        device_class TEXT,
        neighborhood TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS traffic_events_type_created_idx ON traffic_events(event_type, created_at);
      CREATE INDEX IF NOT EXISTS traffic_events_visitor_idx ON traffic_events(visitor_hash, created_at);
      CREATE INDEX IF NOT EXISTS traffic_events_customer_idx ON traffic_events(customer_id);
    `);

    // 6. traffic_hourly_rollups & traffic_daily_rollups
    await client.query(`
      CREATE TABLE IF NOT EXISTS traffic_hourly_rollups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hour_timestamp TIMESTAMPTZ NOT NULL UNIQUE,
        unique_visitors INTEGER NOT NULL DEFAULT 0,
        page_views INTEGER NOT NULL DEFAULT 0,
        event_counts JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS traffic_daily_rollups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date TEXT NOT NULL UNIQUE,
        unique_visitors INTEGER NOT NULL DEFAULT 0,
        new_registrations INTEGER NOT NULL DEFAULT 0,
        funnel_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
        channel_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
        device_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
        area_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 7. customer_outbox_events
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_outbox_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seq BIGSERIAL,
        event_type TEXT NOT NULL,
        aggregate_id UUID NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS customer_outbox_seq_idx ON customer_outbox_events(seq);
    `);

    // 8. Add constraint on OTP automation so it can never be disabled
    // (Checked also server-side in all mutations)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'wa_otp_must_be_enabled'
        ) THEN
          ALTER TABLE wa_automation_templates 
          ADD CONSTRAINT wa_otp_must_be_enabled 
          CHECK (id != 'OTP_VERIFICATION' OR enabled = true);
        END IF;
      END $$;
    `);

    await client.query("COMMIT;");
    console.log("✅ Phase 1 & 2 schema migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.includes("migrate-whatsapp-phase1")) {
  runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
