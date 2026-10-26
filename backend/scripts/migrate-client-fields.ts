import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { pool } from "../src/db";

async function runMigration() {
  console.log("Applying schema updates for customer username/password and client registration...");
  try {
    // 1. Add 'client' to user_role enum
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t 
          JOIN pg_enum e ON t.oid = e.enumtypid 
          WHERE t.typname = 'user_role' AND e.enumlabel = 'client'
        ) THEN
          ALTER TYPE user_role ADD VALUE 'client';
        END IF;
      END
      $$;
    `);
    console.log("✅ 'client' added to user_role enum");

    // 2. Add columns to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS username text,
      ADD COLUMN IF NOT EXISTS business_name text;
    `);

    // Create unique index for username where username is not null
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (username) WHERE username IS NOT NULL;
    `);
    console.log("✅ Added username and business_name columns with unique index");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await pool.end();
  }
}

runMigration();
