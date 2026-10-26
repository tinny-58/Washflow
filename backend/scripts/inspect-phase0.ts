import { pool } from "../src/db";

async function main() {
  console.log("=== CHECKING POSTGIS ===");
  const ext = await pool.query("SELECT name, default_version, installed_version, comment FROM pg_available_extensions WHERE name = 'postgis'");
  console.log("PostGIS Available:", ext.rows);
  const installed = await pool.query("SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis'");
  console.log("PostGIS Installed:", installed.rows);

  console.log("\n=== CHECKING TABLES IN WASHFLOW DB ===");
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.table(tables.rows);

  console.log("\n=== CHECKING ENUMS ===");
  const enums = await pool.query(`
    SELECT t.typname as enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname;
  `);
  console.table(enums.rows);

  process.exit(0);
}

main().catch((err) => {
  console.error("Inspection error:", err);
  process.exit(1);
});
