import { pool } from "../src/db";

async function runPhase2Migration() {
  console.log("Running Phase 2 Sync & Consent Schema Migration...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Add version column to price_catalog for optimistic concurrency control
    await client.query(`
      ALTER TABLE price_catalog 
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
    `);

    // 2. Create catalog_outbox_events table for transactional outbox pattern
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        last_error text,
        scheduled_for timestamp with time zone NOT NULL DEFAULT now(),
        processed_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS catalog_outbox_status_idx 
        ON catalog_outbox_events(status, scheduled_for);
    `);

    // 3. Create consent_ledger table for audit-compliant consent tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS consent_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id uuid REFERENCES users(id) ON DELETE SET NULL,
        phone text,
        purpose text NOT NULL, -- 'terms' | 'marketing_whatsapp'
        status text NOT NULL,  -- 'granted' | 'withdrawn'
        version text NOT NULL DEFAULT 'v1.0',
        source text NOT NULL,   -- 'signup_form' | 'whatsapp_incoming_stop' | 'settings' | 'admin_override'
        ip_hash text,
        user_agent text,
        meta jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS consent_ledger_client_purpose_idx 
        ON consent_ledger(client_id, purpose, created_at DESC);
      CREATE INDEX IF NOT EXISTS consent_ledger_phone_purpose_idx 
        ON consent_ledger(phone, purpose, created_at DESC);
    `);

    // 4. Ensure catalog_versions has record 1
    await client.query(`
      INSERT INTO catalog_versions (id, version, updated_at) 
      VALUES (1, 1, now()) 
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query("COMMIT");
    console.log("Phase 2 & Consent Schema Migration completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runPhase2Migration().catch((err) => {
  console.error(err);
  process.exit(1);
});
