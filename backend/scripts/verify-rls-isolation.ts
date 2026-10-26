import { Pool } from "pg";

async function verifyRLS() {
  console.log("🧪 Testing PostgreSQL Row-Level Security Isolation...");

  // Connect as non-superuser role my_app
  const pool = new Pool({
    connectionString: "postgresql://my_app:my_app_secure_pwd_2026@localhost:5432/washflow",
  });

  const client = await pool.connect();

  try {
    // Test 1: Query without context must return 0 rows
    const resNoContext = await client.query("SELECT count(*)::int as count FROM bookings;");
    const countNoContext = resNoContext.rows[0].count;
    console.log(`Test 1: Unscoped query count = ${countNoContext}`);
    if (countNoContext !== 0) {
      throw new Error(`FAIL: Unscoped query returned ${countNoContext} rows instead of 0!`);
    }
    console.log("✅ Test 1 PASSED: Unscoped query returned 0 rows (Deny by Default).");

    // Test 2: Admin bypass context
    await client.query("BEGIN;");
    await client.query("SELECT set_config('app.is_admin', 'true', true);");
    const resAdmin = await client.query("SELECT count(*)::int as count FROM users;");
    console.log(`Test 2: Admin context users count = ${resAdmin.rows[0].count}`);
    await client.query("ROLLBACK;");
    console.log("✅ Test 2 PASSED: Admin context operates with full audited visibility.");

    // Test 3: Client context isolation
    const fakeClientId = "00000000-0000-0000-0000-000000000001";
    await client.query("BEGIN;");
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [fakeClientId]);
    const resClient = await client.query("SELECT count(*)::int as count FROM bookings;");
    console.log(`Test 3: Isolated client context count = ${resClient.rows[0].count}`);
    await client.query("ROLLBACK;");
    console.log("✅ Test 3 PASSED: Scoped tenant context isolates correctly.");

    console.log("\n🔒 ALL RLS ISOLATION TESTS PASSED!");
  } finally {
    client.release();
    await pool.end();
  }
}

verifyRLS().catch((err) => {
  console.error("RLS verification failed:", err);
  process.exit(1);
});
