import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Worker } from "bullmq";
import { getRedis } from "../src/lib/rate-limiter";
import { db } from "../src/db";
import { notifications } from "../src/db/schema";
import { sendWhatsAppMessage } from "../src/lib/notifications/whatsapp";
import { sendEmailMessage } from "../src/lib/notifications/email";
import { eq } from "drizzle-orm";
import { env } from "../src/lib/env";

console.log("🚀 Starting WashFlow Standalone Notification Worker...");

async function start() {
  const redis = await getRedis();
  if (!redis) {
    console.error("❌ Redis is not available. Please start Redis to run standalone worker.");
    process.exit(1);
  }

  const worker = new Worker(
    "washflow-notifications",
    async (job) => {
      console.log(`📦 Processing notification job ${job.id}:`, job.data);
      const { bookingId, customerName, customerPhone, total, pickupWindow, posterSrc } = job.data;

      // 1. WhatsApp Customer
      const customerMsg = `✨ Hello ${customerName}! Your WashFlow pickup has been confirmed for ${pickupWindow}. Total: KES ${total}. Track your laundry anytime: ${env.NEXT_PUBLIC_APP_URL}/track/${bookingId}`;
      await sendWhatsAppMessage({ toPhone: customerPhone, messageText: customerMsg });

      // 2. WhatsApp Admin
      const adminMsg = `🚨 *New WashFlow Booking!* ${posterSrc ? `[via ${posterSrc}]` : ""}\nCustomer: ${customerName} (${customerPhone})\nAmount: KES ${total}\nPickup: ${pickupWindow}`;
      await sendWhatsAppMessage({ toPhone: env.ADMIN_NOTIFY_PHONE, messageText: adminMsg });

      // 3. Email Admin
      await sendEmailMessage({
        toEmail: env.ADMIN_EMAIL,
        subject: `[WashFlow] New Order KES ${total}`,
        htmlContent: `<p>New booking by ${customerName} for ${pickupWindow}. Total: KES ${total}.</p>`,
      });

      console.log(`✅ Finished notification job ${job.id}`);
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err);
  });

  console.log("👂 Notification worker is listening for jobs on 'washflow-notifications' queue...");
}

start();
