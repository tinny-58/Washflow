import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function setupRLS() {
  console.log("🔒 Configuring PostgreSQL Row-Level Security (RLS) for WashFlow...");

  // 1. Configure my_app role password and grants
  await db.execute(sql`
    ALTER USER my_app WITH PASSWORD 'my_app_secure_pwd_2026';
    GRANT USAGE ON SCHEMA public TO my_app;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO my_app;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO my_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO my_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO my_app;
  `);
  console.log("✅ Granted permissions on schema public to my_app role");

  // 2. Client-owned tables configuration
  const tenantTables = [
    { name: "bookings", clientCol: "customer_id" },
    { name: "addresses", clientCol: "user_id" },
    { name: "vouchers", clientCol: "client_id" },
    { name: "notifications", clientCol: "user_id" },
    { name: "sessions", clientCol: "user_id" },
    { name: "loyalty_ledger", clientCol: "user_id" },
    { name: "client_encryption_keys", clientCol: "client_id" },
  ];

  for (const table of tenantTables) {
    // Enable and FORCE RLS
    await db.execute(sql.raw(`ALTER TABLE "${table.name}" ENABLE ROW LEVEL SECURITY;`));
    await db.execute(sql.raw(`ALTER TABLE "${table.name}" FORCE ROW LEVEL SECURITY;`));

    // Drop previous policies if any
    await db.execute(sql.raw(`DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table.name}";`));
    await db.execute(sql.raw(`DROP POLICY IF EXISTS "admin_bypass_policy" ON "${table.name}";`));

    // Create Tenant Policy
    await db.execute(sql.raw(`
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
    `));

    console.log(`✅ Configured RLS on table: ${table.name}`);
  }

  // 3. Referrals table has dual ownership (referrer_id OR referred_user_id)
  await db.execute(sql`
    ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "referrals" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "referrals_tenant_policy" ON "referrals";
    CREATE POLICY "referrals_tenant_policy" ON "referrals"
    FOR ALL
    TO my_app
    USING (
      referrer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      OR referred_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      OR current_setting('app.is_admin', true) = 'true'
    )
    WITH CHECK (
      referrer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      OR referred_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      OR current_setting('app.is_admin', true) = 'true'
    );
  `);
  console.log("✅ Configured dual-owner RLS on referrals table");

  // Verify RLS status on tables
  const result = await db.execute(sql`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN (
      'bookings', 'addresses', 'vouchers', 'notifications', 'sessions', 'loyalty_ledger', 'referrals'
    );
  `);
  console.log("\nRLS Status Table Check:");
  console.table(result.rows);

  console.log("\n🎉 Row-Level Security successfully enabled and verified!");
  process.exit(0);
}

setupRLS().catch((err) => {
  console.error("Failed to setup RLS:", err);
  process.exit(1);
});
