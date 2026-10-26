import { pool } from "../src/db";

async function runMigration() {
  console.log("🚀 Starting Production Database Migration...");
  const client = await pool.connect();
  try {
    // 1. Enum update (must be outside transaction block in PostgreSQL)
    console.log("1. Updating user_role enum...");
    try {
      await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user'`);
    } catch (enumErr: any) {
      console.log("   Notice on user_role:", enumErr.message);
    }

    // Now run remaining schema changes
    await client.query("BEGIN");

    console.log("2. Updating users table & constraints...");
    await client.query(`UPDATE users SET role = 'user' WHERE role::text IN ('customer', 'client')`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin_idx ON users (role) WHERE role = 'admin'`);

    console.log("3. Updating otp_codes schema...");
    await client.query(`ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS identifier_hash text`);
    await client.query(`ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS session_binding_id text`);
    await client.query(`ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS salt text`);
    await client.query(`ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5`);
    await client.query(`ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS last_sent_at timestamp with time zone NOT NULL DEFAULT now()`);
    await client.query(`ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1`);

    await client.query(`UPDATE otp_codes SET identifier_hash = encode(sha256(identifier::bytea), 'hex') WHERE identifier_hash IS NULL AND identifier IS NOT NULL`);
    await client.query(`UPDATE otp_codes SET salt = encode(sha256(random()::text::bytea), 'hex') WHERE salt IS NULL`);
    await client.query(`UPDATE otp_codes SET session_binding_id = 'legacy_session' WHERE session_binding_id IS NULL`);

    await client.query(`UPDATE otp_codes SET consumed_at = now() WHERE consumed_at IS NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS otp_codes_active_unique_idx ON otp_codes (purpose, identifier_hash) WHERE consumed_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS otp_codes_lookup_idx ON otp_codes (identifier_hash, purpose, consumed_at, expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS otp_codes_session_idx ON otp_codes (session_binding_id)`);

    console.log("4. Creating verification_tokens table...");
    await client.query(`CREATE TABLE IF NOT EXISTS verification_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash text NOT NULL UNIQUE,
      identifier_hash text NOT NULL,
      purpose text NOT NULL,
      session_binding_id text NOT NULL,
      metadata text,
      expires_at timestamp with time zone NOT NULL,
      consumed_at timestamp with time zone,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS verification_tokens_lookup_idx ON verification_tokens (token_hash, consumed_at, expires_at)`);

    console.log("5. Updating sessions table...");
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS idle_expires_at timestamp with time zone`);
    await client.query(`UPDATE sessions SET idle_expires_at = expires_at WHERE idle_expires_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, revoked_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (session_token_hash)`);

    console.log("6. Creating wa_auth_state table...");
    await client.query(`CREATE TABLE IF NOT EXISTS wa_auth_state (
      id text PRIMARY KEY,
      encrypted_data text NOT NULL,
      iv text NOT NULL,
      tag text NOT NULL,
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )`);

    console.log("7. Creating wa_outbound_messages and wa_session_events...");
    await client.query(`DO $$ BEGIN
      CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`);

    await client.query(`DO $$ BEGIN
      CREATE TYPE message_purpose AS ENUM ('signup_otp', 'reset_otp', 'security_alert', 'notification');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`);

    await client.query(`CREATE TABLE IF NOT EXISTS wa_outbound_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      otp_id uuid REFERENCES otp_codes(id) ON DELETE SET NULL,
      purpose message_purpose NOT NULL,
      recipient_masked text NOT NULL,
      recipient_hash text NOT NULL,
      provider_message_id text UNIQUE,
      status message_status NOT NULL DEFAULT 'queued',
      queued_at timestamp with time zone NOT NULL DEFAULT now(),
      sent_at timestamp with time zone,
      delivered_at timestamp with time zone,
      read_at timestamp with time zone,
      failed_at timestamp with time zone,
      failure_reason text,
      attempts integer NOT NULL DEFAULT 0
    )`);

    await client.query(`CREATE INDEX IF NOT EXISTS wa_messages_status_idx ON wa_outbound_messages (status, queued_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS wa_messages_recipient_hash_idx ON wa_outbound_messages (recipient_hash)`);

    await client.query(`CREATE TABLE IF NOT EXISTS wa_session_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type text NOT NULL,
      status_code integer,
      details text,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )`);

    await client.query(`CREATE INDEX IF NOT EXISTS wa_events_type_created_idx ON wa_session_events (event_type, created_at)`);

    await client.query("COMMIT");
    console.log("✅ Production Migration Applied Successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration error:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error("Migration execution failed:", err);
  process.exit(1);
});
