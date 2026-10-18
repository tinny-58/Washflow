import { Queue, Worker } from "bullmq";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendEmailMessage } from "./email";
import { getRedis } from "../rate-limiter";
import { env } from "../env";
import { eq } from "drizzle-orm";

export interface BookingNotificationJobData {
  bookingId: string;
  customerName: string;
  customerPhone: string;
  total: number;
  pickupWindow: string;
  posterSrc?: string | null;
}

let notificationQueue: Queue | null = null;
let notificationWorker: Worker | null = null;

// Core notification delivery logic
async function processNotificationJob(data: BookingNotificationJobData) {
  const { bookingId, customerName, customerPhone, total, pickupWindow, posterSrc } = data;

  const adminPhone = env.ADMIN_NOTIFY_PHONE;
  const adminEmail = env.ADMIN_EMAIL;

  // 1. In-App Notification Record
  try {
    await db.insert(notifications).values({
      type: "NEW_BOOKING_ALERT",
      bookingId,
      channel: "app",
      status: "SENT",
      attempts: 1,
      payload: { customerName, total, pickupWindow },
    });
  } catch (err) {
    console.error("Failed to record in-app notification:", err);
  }

  // 2. WhatsApp to Customer
  const customerWhatsAppMsg = `✨ Hello ${customerName}! Your WashFlow pickup has been confirmed for ${pickupWindow}. Total: KES ${total}. Track your laundry anytime: ${env.NEXT_PUBLIC_APP_URL}/track/${bookingId}`;

  const [customerWaRow] = await db
    .insert(notifications)
    .values({
      type: "CUSTOMER_BOOKING_CONFIRMATION",
      bookingId,
      channel: "whatsapp",
      status: "PENDING",
      attempts: 1,
      payload: { to: customerPhone },
    })
    .returning();

  const customerWaRes = await sendWhatsAppMessage({
    toPhone: customerPhone,
    messageText: customerWhatsAppMsg,
  });

  await db
    .update(notifications)
    .set({
      status: customerWaRes.success ? "SENT" : "FAILED",
      lastError: customerWaRes.error || null,
    })
    .where(eq(notifications.id, customerWaRow.id));

  // 3. WhatsApp to Admin/Owner
  const posterTag = posterSrc ? ` [via ${posterSrc}]` : "";
  const adminWhatsAppMsg = `🚨 *New WashFlow Booking!*${posterTag}\nCustomer: ${customerName} (${customerPhone})\nAmount: KES ${total}\nPickup: ${pickupWindow}\nManage order: ${env.NEXT_PUBLIC_APP_URL}/admin`;

  const [adminWaRow] = await db
    .insert(notifications)
    .values({
      type: "ADMIN_NEW_BOOKING_ALERT",
      bookingId,
      channel: "whatsapp",
      status: "PENDING",
      attempts: 1,
      payload: { to: adminPhone },
    })
    .returning();

  const adminWaRes = await sendWhatsAppMessage({
    toPhone: adminPhone,
    messageText: adminWhatsAppMsg,
  });

  await db
    .update(notifications)
    .set({
      status: adminWaRes.success ? "SENT" : "FAILED",
      lastError: adminWaRes.error || null,
    })
    .where(eq(notifications.id, adminWaRow.id));

  // 4. Email to Admin
  const [emailRow] = await db
    .insert(notifications)
    .values({
      type: "ADMIN_NEW_BOOKING_EMAIL",
      bookingId,
      channel: "email",
      status: "PENDING",
      attempts: 1,
      payload: { to: adminEmail },
    })
    .returning();

  const emailRes = await sendEmailMessage({
    toEmail: adminEmail,
    subject: `[WashFlow] New Booking Received - KES ${total}`,
    htmlContent: `
      <h2>New Laundry Booking Received!</h2>
      <p><strong>Customer:</strong> ${customerName} (${customerPhone})</p>
      <p><strong>Total:</strong> KES ${total}</p>
      <p><strong>Pickup Window:</strong> ${pickupWindow}</p>
      ${posterSrc ? `<p><strong>Source:</strong> ${posterSrc}</p>` : ""}
      <p><a href="${env.NEXT_PUBLIC_APP_URL}/admin">Open Admin Dashboard</a></p>
    `,
  });

  await db
    .update(notifications)
    .set({
      status: emailRes.success ? "SENT" : "FAILED",
      lastError: emailRes.error || null,
    })
    .where(eq(notifications.id, emailRow.id));
}

/**
 * Initializes BullMQ queue if Redis is connected.
 */
async function initBullMQ(): Promise<Queue | null> {
  if (notificationQueue) return notificationQueue;

  const redis = await getRedis();
  if (!redis) return null;

  try {
    notificationQueue = new Queue("washflow-notifications", {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    if (!notificationWorker) {
      notificationWorker = new Worker(
        "washflow-notifications",
        async (job) => {
          await processNotificationJob(job.data);
        },
        { connection: redis }
      );
    }

    return notificationQueue;
  } catch (err) {
    console.warn("BullMQ initialization failed, will use direct async processor:", err);
    return null;
  }
}

/**
 * Enqueues or dispatches notifications for a new booking.
 * Never blocks the caller.
 */
export async function notifyNewBooking(data: BookingNotificationJobData): Promise<void> {
  const queue = await initBullMQ();

  if (queue) {
    await queue.add("notify-booking", data);
  } else {
    // Non-blocking asynchronous direct execution
    setImmediate(async () => {
      try {
        await processNotificationJob(data);
      } catch (err) {
        console.error("Direct notification processing error:", err);
      }
    });
  }
}
