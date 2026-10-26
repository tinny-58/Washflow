import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { pool } from "../src/db";

async function runMigration() {
  console.log("Applying idempotent schema updates for Auth Rebuild...");
  try {
    // 1. Try enabling citext extension
    try {
      await pool.query("CREATE EXTENSION IF NOT EXISTS citext;");
      console.log("✅ citext extension enabled");
    } catch (e) {
      console.warn("⚠️ citext extension could not be enabled, continuing with lower(username) index fallback:", e);
    }

    // 2. Update users table columns
    await pool.query(`
      ALTER TABLE users 
        ALTER COLUMN phone DROP NOT NULL;
    `);

    await pool.query(`
      ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS phone_e164 text,
        ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'credentials',
        ADD COLUMN IF NOT EXISTS google_sub text,
        ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
    `);
    console.log("✅ users columns updated (phone nullable, phone_e164, auth_provider, google_sub, updated_at)");

    // Backfill phone_e164 from phone where missing
    await pool.query(`
      UPDATE users 
      SET phone_e164 = phone 
      WHERE phone_e164 IS NULL AND phone IS NOT NULL;
    `);
    console.log("✅ phone_e164 backfilled from phone");

    // Indexes on users
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username)) WHERE username IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_idx ON users (phone_e164) WHERE phone_e164 IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub) WHERE google_sub IS NOT NULL;
    `);
    console.log("✅ users indexes created");

    // 3. Create otp_codes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier text NOT NULL,
        purpose text NOT NULL,
        code_hash text NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        expires_at timestamp with time zone NOT NULL,
        consumed_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS otp_codes_lookup_idx ON otp_codes (identifier, purpose, expires_at);
      CREATE INDEX IF NOT EXISTS otp_codes_created_idx ON otp_codes (created_at);
    `);
    console.log("✅ otp_codes table and indexes verified");

    // 4. Create sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token_hash text NOT NULL UNIQUE,
        refresh_token_hash text,
        user_agent text,
        ip_hash text NOT NULL,
        expires_at timestamp with time zone NOT NULL,
        revoked_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        last_active_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (session_token_hash);
    `);
    console.log("✅ sessions table and indexes verified");

    // 5. Create auth_audit_log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        event text NOT NULL,
        identifier_masked text,
        ip_hash text NOT NULL,
        user_agent text,
        status text NOT NULL DEFAULT 'success',
        metadata jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS auth_audit_log_created_idx ON auth_audit_log (created_at);
      CREATE INDEX IF NOT EXISTS auth_audit_log_event_idx ON auth_audit_log (event);
    `);
    console.log("✅ auth_audit_log table and indexes verified");

    console.log("🎉 Auth Rebuild migration applied successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
