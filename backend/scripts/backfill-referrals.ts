import { pool, db } from "../src/db";
import { users } from "../src/db/schema";
import { isNull, eq } from "drizzle-orm";

async function main() {
  const usersWithoutCode = await db.select().from(users).where(isNull(users.referralCode));
  console.log(`Found ${usersWithoutCode.length} users needing referral codes.`);

  for (const u of usersWithoutCode) {
    const clean = (u.username || u.name.split(" ")[0] || "WASH")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6);
    const code = `WF-${clean}${Math.floor(100 + Math.random() * 900)}`;

    await db.update(users).set({ referralCode: code }).where(eq(users.id, u.id));
    console.log(`Assigned ${code} to ${u.name}`);
  }
  await pool.end();
}

main().catch(console.error);
