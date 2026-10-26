import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function checkMyApp() {
  const grants = await db.execute(sql`
    SELECT table_name, privilege_type
    FROM information_schema.table_privileges
    WHERE grantee = 'my_app'
    LIMIT 10;
  `);
  console.log("Grants for my_app:", grants.rows);

  process.exit(0);
}

checkMyApp().catch(console.error);
