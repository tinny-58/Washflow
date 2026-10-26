import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
  WAMessageStatus,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import Redis from "ioredis";
import { Worker } from "bullmq";
import { pool, db } from "../src/db";
import { waOutboundMessages, waSessionEvents } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { env } from "../src/lib/env";
import { usePostgresAuthState } from "../src/lib/baileys/encrypted-auth-store";
import type { OtpJobData } from "../src/lib/baileys/queue";

const BAILEYS_ADVISORY_LOCK_ID = 1463899208; // 0x57415348 in decimal
const logger = pino({ level: "warn" });

let sock: WASocket | null = null;
let isConnected = false;
let isConnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let bullMqWorker: Worker<OtpJobData> | null = null;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Format phone number to WhatsApp JID: <digits>@s.whatsapp.net
function toWhatsAppJid(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

async function recordSessionEvent(eventType: string, statusCode?: number, details?: string) {
  try {
    await db.insert(waSessionEvents).values({
      eventType,
      statusCode: statusCode || null,
      details: details || null,
    });
  } catch (err) {
    console.error("Failed to record wa_session_event:", err);
  }
}

async function startBaileysSocket(): Promise<void> {
  if (isConnecting || isConnected) return;
  isConnecting = true;

  try {
    const { state, saveCreds, clearAllState } = await usePostgresAuthState();
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307] as [number, number, number],
    }));

    sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      browser: ["WashFlow Production Worker", "Chrome", "1.0.0"],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n=======================================================");
        console.log("📱 WASHFLOW OPERATOR: Scan QR with WhatsApp Business Number:");
        console.log("=======================================================");
        try {
          const terminalQr = await QRCode.toString(qr, { type: "terminal", small: true });
          console.log(terminalQr);
        } catch {}
        console.log("=======================================================\n");
        await recordSessionEvent("qr", undefined, "QR code presented to operator terminal");
      }

      if (connection === "open") {
        isConnected = true;
        isConnecting = false;
        const sockUser = sock?.user;
        const phone = sockUser?.id ? sockUser.id.split(":")[0] : "unknown";
        console.log(`\n✅ [Baileys Worker] Connected securely as +${phone}`);
        await recordSessionEvent("connect", undefined, `Connected as ${phone}`);

        if (bullMqWorker) {
          bullMqWorker.resume();
          console.log("🚀 [Baileys Worker] Outbound queue resumed and ready for dispatches.");
        }
      } else if (connection === "close") {
        isConnected = false;
        isConnecting = false;

        if (bullMqWorker) {
          bullMqWorker.pause(true);
        }

        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        console.warn(`\n⚠️ [Baileys Worker] Connection closed. Status code: ${statusCode}`);
        await recordSessionEvent("disconnect", statusCode, lastDisconnect?.error?.message);

        if (statusCode === DisconnectReason.loggedOut) {
          console.error("❌ [Baileys Worker] WhatsApp session was logged out. Clearing auth state.");
          await clearAllState();
          await recordSessionEvent("logout", statusCode, "Session cleared after logout");
        } else if (statusCode === DisconnectReason.connectionReplaced) {
          console.error("❌ [Baileys Worker] Connection replaced by another session. Halting reconnect.");
        } else {
          // Reconnect with backoff
          const delayMs = 5000;
          console.log(`[Baileys Worker] Reconnecting in ${delayMs / 1000}s...`);
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            startBaileysSocket();
          }, delayMs);
        }
      }
    });

    // Monotonic receipt updates: sent -> delivered -> read
    sock.ev.on("messages.update", async (updates) => {
      for (const item of updates) {
        const msgId = item.key?.id;
        const status = item.update?.status;
        if (!msgId || status === undefined) continue;

        try {
          if (status === WAMessageStatus.DELIVERY_ACK) {
            await pool.query(
              `UPDATE wa_outbound_messages 
               SET status = 'delivered', delivered_at = NOW() 
               WHERE provider_message_id = $1 AND status IN ('queued', 'sent')`,
              [msgId]
            );
          } else if (status === WAMessageStatus.READ || status === WAMessageStatus.PLAYED) {
            await pool.query(
              `UPDATE wa_outbound_messages 
               SET status = 'read', read_at = NOW(), delivered_at = COALESCE(delivered_at, NOW()) 
               WHERE provider_message_id = $1 AND status IN ('queued', 'sent', 'delivered')`,
              [msgId]
            );
          } else if (status === WAMessageStatus.ERROR) {
            await pool.query(
              `UPDATE wa_outbound_messages 
               SET status = 'failed', failed_at = NOW(), failure_reason = 'RECEIPT_ERROR' 
               WHERE provider_message_id = $1 AND status != 'read'`,
              [msgId]
            );
          }
        } catch (dbErr) {
          console.error("Failed to update message status:", dbErr);
        }
      }
    });

    sock.ev.on("message-receipt.update", async (receipts) => {
      for (const receipt of receipts) {
        const msgId = receipt.key?.id;
        if (!msgId) continue;

        try {
          if (receipt.receipt?.readTimestamp) {
            await pool.query(
              `UPDATE wa_outbound_messages 
               SET status = 'read', read_at = NOW(), delivered_at = COALESCE(delivered_at, NOW()) 
               WHERE provider_message_id = $1 AND status IN ('queued', 'sent', 'delivered')`,
              [msgId]
            );
          } else {
            await pool.query(
              `UPDATE wa_outbound_messages 
               SET status = 'delivered', delivered_at = NOW() 
               WHERE provider_message_id = $1 AND status IN ('queued', 'sent')`,
              [msgId]
            );
          }
        } catch (dbErr) {
          console.error("Failed to update receipt status:", dbErr);
        }
      }
    });
  } catch (err) {
    isConnecting = false;
    isConnected = false;
    console.error("Failed to initialize Baileys socket:", err);
    setTimeout(startBaileysSocket, 10000);
  }
}

// ----------------------------------------------------------------------------
// Redis RPC: Handle onWhatsApp Checks from Web API
// ----------------------------------------------------------------------------
function setupRpcListener() {
  const rpcSub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const rpcPub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  rpcSub.subscribe("wa:rpc:check", (err) => {
    if (err) {
      console.error("Failed to subscribe to wa:rpc:check:", err);
    } else {
      console.log("👂 [Baileys Worker] RPC listener active for onWhatsApp queries");
    }
  });

  rpcSub.on("message", async (_channel, message) => {
    try {
      const { requestId, phone, responseChannel } = JSON.parse(message);
      if (!sock || !isConnected) {
        await rpcPub.publish(
          responseChannel,
          JSON.stringify({
            exists: false,
            error: "WhatsApp delivery service is currently reconnecting. Please try again shortly.",
          })
        );
        return;
      }

      const jid = toWhatsAppJid(phone);
      const results = await sock.onWhatsApp(jid);
      const exists = Boolean(results && results.length > 0 && results[0].exists);

      await rpcPub.publish(
        responseChannel,
        JSON.stringify({ exists })
      );
    } catch (err: any) {
      console.error("RPC onWhatsApp handler error:", err);
    }
  });
}

// ----------------------------------------------------------------------------
// BullMQ Outbound Message Delivery Worker
// ----------------------------------------------------------------------------
function setupBullMqWorker() {
  const redisConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  bullMqWorker = new Worker<OtpJobData>(
    "washflow-otp-delivery",
    async (job) => {
      // 0. Discard stale jobs older than 5 minutes (OTP validity window)
      const jobAge = Date.now() - job.timestamp;
      if (jobAge > 5 * 60 * 1000) {
        console.log(`⏰ [Baileys Worker] Discarding expired OTP job ${job.id} (${Math.round(jobAge / 1000)}s old)`);
        return { success: false, discarded: true };
      }

      const { otpId, toPhone, otpCode, purpose } = job.data;

      if (!sock || !isConnected) {
        throw new Error("WhatsApp socket is not connected. Failing job for retry.");
      }

      // 1. Enforce sequential pacing with randomized jitter (500ms - 1500ms)
      const jitterMs = Math.floor(Math.random() * 1000) + 500;
      await sleep(jitterMs);

      const jid = toWhatsAppJid(toPhone);

      // 2. Format plain message text per prompt requirements
      const messageText =
        purpose === "reset_password"
          ? `Your WashFlow password reset code is ${otpCode}. It expires in 5 minutes. Never share this code.`
          : purpose === "admin_stepup"
          ? `Your WashFlow Administrator verification code is ${otpCode}. It expires in 5 minutes. Never share this code.`
          : `Your WashFlow verification code is ${otpCode}. It expires in 5 minutes. Never share this code.`;

      // 3. Send message via Baileys socket
      const result = await sock.sendMessage(jid, { text: messageText });
      const providerMessageId = result?.key?.id;

      if (!providerMessageId) {
        throw new Error("Failed to receive message key ID from WhatsApp network.");
      }

      // 4. Update status monotonically in database
      await pool.query(
        `UPDATE wa_outbound_messages 
         SET provider_message_id = $1, status = 'sent', sent_at = NOW(), attempts = attempts + 1 
         WHERE otp_id = $2`,
        [providerMessageId, otpId]
      );

      console.log(`📨 [Baileys Worker] Dispatched ${purpose} to ${toPhone.slice(0, 7)}••• (MsgID: ${providerMessageId})`);
      return { success: true, providerMessageId };
    },
    {
      connection: redisConnection,
      concurrency: 1, // Sequential delivery prevents bursts and ban triggers
    }
  );

  bullMqWorker.on("failed", async (job, err) => {
    console.error(`❌ [Baileys Worker] OTP dispatch job ${job?.id} failed:`, err.message);
    if (job?.data?.otpId) {
      await pool.query(
        `UPDATE wa_outbound_messages 
         SET status = 'failed', failed_at = NOW(), failure_reason = $1 
         WHERE otp_id = $2 AND status = 'queued'`,
        [err.message.slice(0, 255), job.data.otpId]
      ).catch(() => {});
    }
  });

  // Pause queue consumption until WhatsApp socket is connected
  if (!isConnected) {
    bullMqWorker.pause(true);
    console.log("⏸️  [Baileys Worker] Outbound OTP queue paused until WhatsApp socket connects.");
  } else {
    console.log("🚀 [Baileys Worker] Outbound OTP Queue Worker listening (Concurrency: 1)");
  }
}

// ----------------------------------------------------------------------------
// Worker Initialization with PostgreSQL Advisory Lock
// ----------------------------------------------------------------------------
async function main() {
  console.log("🔒 [Baileys Worker] Requesting PostgreSQL advisory lock (0x57415348)...");
  const lockClient = await pool.connect();

  try {
    const lockRes = await lockClient.query(
      "SELECT pg_try_advisory_lock($1) as acquired",
      [BAILEYS_ADVISORY_LOCK_ID]
    );

    if (!lockRes.rows[0]?.acquired) {
      console.error(
        "❌ FATAL: Another Baileys worker instance holds the active WhatsApp lock. Exiting to prevent logout conflicts."
      );
      lockClient.release();
      process.exit(0);
    }

    console.log("✅ [Baileys Worker] Advisory lock acquired! Running single authoritative socket.");

    // Initialize Baileys socket, RPC listener, and queue worker
    await startBaileysSocket();
    setupRpcListener();
    setupBullMqWorker();

    // Clean exit handlers
    const shutdown = async () => {
      console.log("\n🛑 [Baileys Worker] Releasing advisory lock and shutting down...");
      await lockClient.query("SELECT pg_advisory_unlock($1)", [BAILEYS_ADVISORY_LOCK_ID]);
      lockClient.release();
      if (sock) {
        sock.end(undefined);
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    console.error("Worker startup error:", err);
    lockClient.release();
    process.exit(1);
  }
}

main();
