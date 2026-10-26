import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { pool } from "../src/db";
import Redis from "ioredis";

async function main() {
  console.log("=================================================");
  console.log("🛠️ WASHFLOW MAINTENANCE: EXPIRE STALE OTP QUEUE");
  console.log("=================================================");

  // 1. Alter Postgres Enum to include 'expired'
  try {
    await pool.query("ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'expired'");
    console.log("✅ Added 'expired' to message_status enum in PostgreSQL");
  } catch (err: any) {
    console.warn("Notice on alter enum:", err.message);
  }

  // 2. Count stale messages before update
  const beforeCount = await pool.query(
    "SELECT status, count(*) FROM wa_outbound_messages GROUP BY status"
  );
  console.log("\n📊 Outbound messages breakdown before maintenance:", beforeCount.rows);

  const staleRows = await pool.query(
    "SELECT count(*) FROM wa_outbound_messages WHERE status IN ('queued', 'failed') AND queued_at < NOW() - INTERVAL '5 minutes'"
  );
  console.log(`\n🔍 Found ${staleRows.rows[0].count} stale rows older than 5 minutes.`);

  // 3. Mark all stale rows as 'expired'
  const updateRes = await pool.query(`
    UPDATE wa_outbound_messages 
    SET status = 'expired', 
        failure_reason = COALESCE(failure_reason, 'OTP code expired (5-minute TTL elapsed before sender connected)')
    WHERE status IN ('queued', 'failed')
      AND queued_at < NOW() - INTERVAL '5 minutes'
    RETURNING id
  `);

  console.log(`✅ Successfully updated ${updateRes.rowCount} rows to 'expired'. Audit trail preserved.`);

  // 4. Drain BullMQ Redis queue
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const redis = new Redis(redisUrl);
    
    // Check waiting jobs
    const waitingJobs = await redis.lrange("bull:washflow-otp-delivery:wait", 0, -1);
    console.log(`\n🧹 Found ${waitingJobs.length} waiting jobs in Redis BullMQ queue.`);
    
    // Remove waiting and active jobs
    await redis.del("bull:washflow-otp-delivery:wait");
    await redis.del("bull:washflow-otp-delivery:active");
    await redis.del("bull:washflow-otp-delivery:paused");
    
    // Clean up job hashes that were waiting
    for (const jobId of waitingJobs) {
      await redis.del(`bull:washflow-otp-delivery:${jobId}`);
    }

    console.log("✅ Cleared waiting jobs from Redis BullMQ queue. No burst on reconnect.");
    await redis.quit();
  } catch (redisErr: any) {
    console.error("Redis queue cleanup error:", redisErr.message);
  }

  // 5. Final verification
  const afterCount = await pool.query(
    "SELECT status, count(*) FROM wa_outbound_messages GROUP BY status"
  );
  console.log("\n📊 Final status counts in wa_outbound_messages:", afterCount.rows);

  await pool.end();
  console.log("\n=================================================");
  console.log("🎉 MAINTENANCE COMPLETE");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Maintenance script failed:", err);
  process.exit(1);
});
