import { pool } from "../src/db";

export async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // Add whatsapp_bsuid and whatsapp_username to users table
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS whatsapp_bsuid TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS whatsapp_username TEXT;

      CREATE UNIQUE INDEX IF NOT EXISTS users_whatsapp_bsuid_idx ON users(whatsapp_bsuid);
    `);

    await client.query("COMMIT;");
    console.log("✅ Successfully migrated users table with whatsapp_bsuid and whatsapp_username");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
