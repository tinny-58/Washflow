import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function checkRoles() {
  const roles = await db.execute(sql`
    SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
    FROM pg_roles
    WHERE rolname IN ('postgres', 'my_app');
  `);
  console.log("Roles:", roles.rows);

  const tables = await db.execute(sql`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  console.log("Public tables count:", tables.rows.length);
  console.log("Sample tables:", tables.rows.slice(0, 10));

  process.exit(0);
}

checkRoles().catch((err) => {
  console.error("Error checking roles:", err);
  process.exit(1);
});
