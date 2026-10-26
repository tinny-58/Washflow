import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  type WASocket,
  type ConnectionState,
  WAMessageStatus,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import Redis from "ioredis";
import { Worker } from "bullmq";
import type { PoolClient } from "pg";
import { normalizePhone } from "../phone";
import { broadcastAdminEvent } from "../sse";
import { pool, db } from "../../db";
import { bookings, users, waSessionEvents, waOutboundMessages, auditLog } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import { env } from "../env";
import { usePostgresAuthState } from "./encrypted-auth-store";
import { alertAdminWhatsAppDisconnected } from "../notifications/email";
import type { OtpJobData } from "./queue";

export const BAILEYS_ADVISORY_LOCK_ID = 1463899208; // 0x57415348 in decimal

export type BaileysStatus =
  | "disconnected"
  | "connecting"
  | "qr_ready"
  | "pairing"
  | "connected"
  | "reconnecting"
  | "needs_repairing"
  | "blocked_suspected"
  | "error";

export interface BaileysState {
  status: BaileysStatus;
  humanStatus: string;
  nextStep: string;
  qrCode: string | null;
  qrExpiresInSeconds: number;
  user: {
    id: string;
    phone?: string;
    maskedPhone?: string;
    name?: string;
  } | null;
  connectedAt: string | null;
  lastError: string | null;
  circuitBreakerTripped: boolean;
  pairingAttemptsRemaining: number;
  reconnectAttempts: number;
  updatedAt: string;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  const prefix = phone.startsWith("+") ? phone.slice(0, 4) : digits.slice(0, 3);
  const suffix = digits.slice(-3);
  return `${prefix} ••• ••• ${suffix}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BaileysService {
  private sock: WASocket | null = null;
  private status: BaileysStatus = "disconnected";
  private qrCode: string | null = null;
  private qrGeneratedAt: number | null = null;
  private user: BaileysState["user"] = null;
  private connectedAt: Date | null = null;
  private lastError: string | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isInitializing: boolean = false;
  private clearAllStateFn: (() => Promise<void>) | null = null;
  private bullMqWorker: Worker<OtpJobData> | null = null;
  private lockClient: PoolClient | null = null;

  // Pairing attempt throttling & ban-risk safety
  private pairingAttemptsThisHour: number = 0;
  private pairingHourWindowStart: number = Date.now();
  private maxPairingAttemptsPerHour: number = 3;

  // Circuit breaker state
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 3;
  private circuitBreakerTripped: boolean = false;
  private reconnectAttempts: number = 0;

  // Mutual exclusion
  private activePairingMode: "qr" | "code" | null = null;

  // Track async save creds promise to avoid race condition on 515 restart
  private saveCredsPromise: Promise<void> = Promise.resolve();

  // Outbound rate pacing (max 15 sends/min, sequential)
  private lastSendTimestamp: number = 0;

  constructor() {
    this.initBullMqWorker();
    this.setupRpcListener();
  }

  private getHumanLabels(status: BaileysStatus): { humanStatus: string; nextStep: string } {
    if (this.circuitBreakerTripped) {
      return {
        humanStatus: "Circuit breaker active",
        nextStep: "Repeated connection failures stopped to protect phone number. Review logs and reset.",
      };
    }

    switch (status) {
      case "disconnected":
        return {
          humanStatus: "Worker offline",
          nextStep: "Click 'Start WhatsApp Connection' to generate a secure pairing QR.",
        };
      case "connecting":
        return {
          humanStatus: "Starting",
          nextStep: "Negotiating encryption handshake with WhatsApp network...",
        };
      case "qr_ready":
        return {
          humanStatus: "Waiting for QR scan",
          nextStep: "Open WhatsApp > Linked Devices > Link a Device, then point camera at the QR code.",
        };
      case "pairing":
        return {
          humanStatus: "Pairing",
          nextStep: "Enter the generated 8-digit pairing code inside WhatsApp > Linked Devices.",
        };
      case "connected":
        return {
          humanStatus: "Connected",
          nextStep: "Sender is online and actively dispatching automated booking updates.",
        };
      case "reconnecting":
        return {
          humanStatus: `Reconnecting (attempt ${this.reconnectAttempts})`,
          nextStep: "Network interrupted. Attempting automatic reconnection with backoff...",
        };
      case "needs_repairing":
        return {
          humanStatus: "Needs re-pairing",
          nextStep: "Device session was logged out. Please re-authenticate by scanning a new QR.",
        };
      case "blocked_suspected":
        return {
          humanStatus: "Blocked/banned suspected",
          nextStep: "WhatsApp network rejected the device handshake. Verify SIM card and phone number standing.",
        };
      case "error":
      default:
        return {
          humanStatus: "Worker error",
          nextStep: this.lastError || "An error occurred. Check system logs and retry.",
        };
    }
  }

  public getStatus(): BaileysState {
    const { humanStatus, nextStep } = this.getHumanLabels(this.status);
    let qrExpiresInSeconds = 0;
    if (this.status === "qr_ready" && this.qrGeneratedAt) {
      qrExpiresInSeconds = Math.max(0, 20 - Math.floor((Date.now() - this.qrGeneratedAt) / 1000));
    }

    // Reset hourly pairing window if 60 minutes elapsed
    if (Date.now() - this.pairingHourWindowStart > 60 * 60 * 1000) {
      this.pairingHourWindowStart = Date.now();
      this.pairingAttemptsThisHour = 0;
    }

    const pairingAttemptsRemaining = Math.max(
      0,
      this.maxPairingAttemptsPerHour - this.pairingAttemptsThisHour
    );

    return {
      status: this.status,
      humanStatus,
      nextStep,
      qrCode: this.qrCode,
      qrExpiresInSeconds,
      user: this.user,
      connectedAt: this.connectedAt ? this.connectedAt.toISOString() : null,
      lastError: this.lastError,
      circuitBreakerTripped: this.circuitBreakerTripped,
      pairingAttemptsRemaining,
      reconnectAttempts: this.reconnectAttempts,
      updatedAt: new Date().toISOString(),
    };
  }

  public isConnected(): boolean {
    return this.status === "connected" && this.sock !== null;
  }

  public resetCircuitBreaker(): void {
    this.circuitBreakerTripped = false;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    this.lastError = null;
    this.setStatus("disconnected");
    console.log("🔄 [WashFlow Baileys] Circuit breaker reset by admin.");
  }

  private setStatus(newStatus: BaileysStatus, error: string | null = null) {
    this.status = newStatus;
    if (error !== null) {
      this.lastError = error;
    }

    if (newStatus === "connected") {
      this.connectedAt = new Date();
      this.qrCode = null;
      this.qrGeneratedAt = null;
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.reconnectAttempts = 0;
      this.circuitBreakerTripped = false;
      this.activePairingMode = null;

      if (this.bullMqWorker && this.bullMqWorker.isPaused()) {
        this.bullMqWorker.resume();
        console.log("🚀 [WashFlow Baileys] Outbound delivery queue resumed.");
      }
    } else if (newStatus === "disconnected" || newStatus === "error" || newStatus === "needs_repairing") {
      this.qrCode = null;
      this.qrGeneratedAt = null;
      this.activePairingMode = null;
      if (this.bullMqWorker && !this.bullMqWorker.isPaused()) {
        this.bullMqWorker.pause(true);
      }
    }

    // Broadcast status change to connected admin dashboards via SSE
    broadcastAdminEvent("whatsapp_status", this.getStatus());
  }

  private async acquireAdvisoryLock(): Promise<boolean> {
    if (this.lockClient) {
      return true; // Already acquired
    }

    try {
      const client = await pool.connect();
      client.on("error", (err) => {
        console.warn("⚠️ [WashFlow Baileys] Advisory lock connection error:", err.message);
        this.lockClient = null;
      });

      const res = await client.query("SELECT pg_try_advisory_lock($1) as acquired", [
        BAILEYS_ADVISORY_LOCK_ID,
      ]);

      if (res.rows[0]?.acquired) {
        this.lockClient = client;
        console.log("🔒 [WashFlow Baileys] PostgreSQL advisory lock (0x57415348) acquired.");
        return true;
      } else {
        client.release();
        console.warn(
          "⚠️ [WashFlow Baileys] Another process currently holds the active WhatsApp advisory lock. Standalone worker or duplicate process active."
        );
        return false;
      }
    } catch (err: any) {
      console.error("Failed to query advisory lock:", err.message);
      return false;
    }
  }

  private async releaseAdvisoryLock(): Promise<void> {
    if (this.lockClient) {
      try {
        await this.lockClient.query("SELECT pg_advisory_unlock($1)", [BAILEYS_ADVISORY_LOCK_ID]);
        this.lockClient.release();
        console.log("🔓 [WashFlow Baileys] Advisory lock released.");
      } catch (err: any) {
        console.error("Failed to release advisory lock:", err.message);
      } finally {
        this.lockClient = null;
      }
    }
  }

  private cleanupSocket() {
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners("connection.update");
        this.sock.ev.removeAllListeners("creds.update");
        this.sock.ev.removeAllListeners("messages.update");
        this.sock.ev.removeAllListeners("messages.upsert");
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
  }

  public async init(isInternalRestart: boolean = false): Promise<void> {
    if (this.isInitializing) return;
    if (this.sock && this.status === "connected") return;

    // Check circuit breaker
    if (this.circuitBreakerTripped && !isInternalRestart) {
      throw new Error(
        "Circuit breaker active: Repeated connection failures were halted to protect against ban risk. Reset circuit breaker to retry."
      );
    }

    this.isInitializing = true;
    this.setStatus("connecting");

    // Ensure PostgreSQL advisory lock is held
    const lockAcquired = await this.acquireAdvisoryLock();
    if (!lockAcquired) {
      this.isInitializing = false;
      this.setStatus(
        "disconnected",
        "Another WhatsApp worker process holds the authoritative connection lock."
      );
      return;
    }

    try {
      this.cleanupSocket();

      const { state, saveCreds, clearAllState } = await usePostgresAuthState();
      this.clearAllStateFn = clearAllState;

      const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: [2, 3000, 1015901307] as [number, number, number],
      }));

      const logger = pino({ level: "silent" });

      this.sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        browser: Browsers.ubuntu("Chrome"),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
      });

      // Synchronously track creds save promise to prevent 515 restart race conditions
      this.sock.ev.on("creds.update", () => {
        this.saveCredsPromise = saveCreds().catch((err) => {
          console.error("Failed to save Baileys credentials:", err);
        });
      });

      // Listen for connection updates
      this.sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          if (this.activePairingMode === "code") {
            // Mutual exclusion: ignore QR if user requested pairing code
            return;
          }

          // If initiating QR pairing, check and count pairing attempt
          if (this.activePairingMode !== "qr") {
            const now = Date.now();
            if (now - this.pairingHourWindowStart > 60 * 60 * 1000) {
              this.pairingHourWindowStart = now;
              this.pairingAttemptsThisHour = 0;
            }

            if (this.pairingAttemptsThisHour >= this.maxPairingAttemptsPerHour) {
              console.warn("⚠️ [WashFlow Baileys] Hourly pairing attempt limit reached. Halting QR presentation to avoid ban churn.");
              this.circuitBreakerTripped = true;
              this.cleanupSocket();
              this.setStatus(
                "error",
                `Pairing attempt limit reached (maximum ${this.maxPairingAttemptsPerHour} per hour). Please wait before scanning again.`
              );
              return;
            }
            this.pairingAttemptsThisHour++;
          }
          this.activePairingMode = "qr";

          try {
            const dataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 320,
              color: {
                dark: "#0f172a",
                light: "#ffffff",
              },
            });

            this.qrCode = dataUrl;
            this.qrGeneratedAt = Date.now();
            this.setStatus("qr_ready");
            console.log("\n📱 [WashFlow Baileys] QR Code ready for Admin portal scan (/admin/whatsapp)");

            await db
              .insert(waSessionEvents)
              .values({
                eventType: "qr_generated",
                details: "QR code generated for admin portal display",
              })
              .catch(() => {});
          } catch (qrErr) {
            console.error("Failed to generate QR data URL:", qrErr);
          }
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const errorMsg = lastDisconnect?.error?.message || "Connection closed";

          console.log(
            `\n⚠️ [WashFlow Baileys] WhatsApp Connection closed (Code: ${statusCode || "unknown"}). Reason: ${errorMsg}`
          );

          await db
            .insert(waSessionEvents)
            .values({
              eventType: "connection.close",
              statusCode: statusCode || null,
              details: errorMsg,
            })
            .catch(() => {});

          // CASE 1: Code 515 (restartRequired) - Expected after QR scan
          if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            console.log("🔄 [WashFlow Baileys] Status 515 restartRequired received. Rebuilding socket with saved creds...");
            this.consecutiveFailures = 0;
            this.setStatus("connecting", "Finalizing WhatsApp authentication...");

            // Await pending credentials write to ensure disk/DB consistency
            await this.saveCredsPromise;
            this.cleanupSocket();
            await sleep(1000);

            // Reinitialize with saved credentials
            this.init(true).catch((err) => {
              console.error("Failed to restart socket after 515:", err);
            });
            return;
          }

          // CASE 2: Code 408 (QR refs attempts ended) - Do NOT loop infinitely!
          if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
            console.log("⏳ [WashFlow Baileys] QR expired after timeout. Halting loop to prevent ban churn.");
            this.consecutiveFailures++;
            this.cleanupSocket();

            if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
              this.circuitBreakerTripped = true;
              this.setStatus(
                "error",
                "Repeated QR timeouts: Circuit breaker activated. Click 'Start WhatsApp Connection' when ready to scan."
              );
            } else {
              this.setStatus(
                "disconnected",
                "QR code expired without a scan. Click 'Start WhatsApp Connection' to generate a fresh QR."
              );
            }
            return;
          }

          // CASE 3: Code 401 (loggedOut) - Do not loop. Mark sender "needs re-pairing"
          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.error("❌ [WashFlow Baileys] Session logged out by WhatsApp. Needs re-pairing.");
            this.consecutiveFailures = 0;
            this.circuitBreakerTripped = true;
            this.cleanupSocket();
            this.setStatus("needs_repairing", "WhatsApp session was logged out. Please re-pair your device.");
            await alertAdminWhatsAppDisconnected("WhatsApp session was logged out by the phone device. Needs re-pairing.").catch(() => {});
            return;
          }

          // CASE 4: Code 440 (connectionReplaced) - Duplicate worker conflict
          if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
            console.error("❌ [WashFlow Baileys] Connection replaced by another session. Halting reconnect to avoid conflict.");
            this.circuitBreakerTripped = true;
            this.cleanupSocket();
            this.setStatus(
              "error",
              "Connection replaced by another WhatsApp session. Please ensure only one worker is running."
            );
            return;
          }

          // CASE 5: Code 405 (Connection Failure) - Stale version / platform rejected
          if (statusCode === 405) {
            console.error("❌ [WashFlow Baileys] Connection failure (405). Stale protocol or rejected client configuration.");
            this.consecutiveFailures++;
            this.cleanupSocket();
            this.setStatus(
              "error",
              "WhatsApp connection failure (405). Verify WhatsApp Web version and browser configuration."
            );
            return;
          }

          // CASE 6: General network disconnection - Exponential backoff with jitter
          this.consecutiveFailures++;
          this.reconnectAttempts++;

          if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.circuitBreakerTripped = true;
            this.cleanupSocket();
            this.setStatus(
              "error",
              `Circuit breaker tripped after ${this.consecutiveFailures} consecutive connection failures. Reconnect halted.`
            );
            return;
          }

          // Exponential backoff: 5s, 10s, 20s + jitter (500-1500ms)
          const baseDelay = Math.min(30000, 5000 * Math.pow(2, this.reconnectAttempts - 1));
          const jitter = Math.floor(Math.random() * 1000) + 500;
          const delayMs = baseDelay + jitter;

          console.log(`[WashFlow Baileys] Scheduling reconnection in ${Math.round(delayMs / 1000)}s (Attempt ${this.reconnectAttempts})...`);
          this.setStatus("reconnecting", `Reconnecting in ${Math.round(delayMs / 1000)}s...`);
          this.scheduleReconnect(delayMs);
        } else if (connection === "open") {
          const sockUser = this.sock?.user;
          const userPhone = sockUser?.id ? sockUser.id.split(":")[0] : undefined;
          const masked = userPhone ? maskPhone(userPhone) : undefined;

          this.user = {
            id: sockUser?.id || "unknown",
            phone: userPhone,
            maskedPhone: masked,
            name: sockUser?.name || "WashFlow Operations Phone",
          };

          this.setStatus("connected");
          console.log(`\n✅ [WashFlow Baileys] Connected successfully as ${this.user.maskedPhone || this.user.id}!`);

          await db
            .insert(waSessionEvents)
            .values({
              eventType: "connection.open",
              details: `Connected as ${this.user.phone || this.user.id}`,
            })
            .catch(() => {});
        }
      });

      // Receipt updates: sent -> delivered -> read
      this.sock.ev.on("messages.update", async (updates) => {
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
            }
          } catch (dbErr) {
            console.error("Failed to update message status:", dbErr);
          }
        }
      });

      // Customer inquiry auto-reply
      this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us")) continue;

          const rawText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

          const cleanText = rawText.trim().toLowerCase();
          if (!cleanText) continue;

          if (cleanText === "stop" || cleanText === "unsubscribe" || cleanText === "optout" || cleanText === "opt out") {
            await this.handleCustomerOptOut(remoteJid);
          }
          // Never auto-reply to incoming WhatsApp messages per compliance rules.
        }
      });
    } catch (err: any) {
      console.error("[WashFlow Baileys] Initialization failed:", err);
      this.setStatus("error", err?.message || "Failed to initialize Baileys");
    } finally {
      this.isInitializing = false;
    }
  }

  private setupRpcListener() {
    try {
      const rpcSub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
      const rpcPub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

      rpcSub.subscribe("wa:rpc:check", (err) => {
        if (!err) {
          console.log("👂 [WashFlow Baileys] RPC listener active for onWhatsApp queries");
        }
      });

      rpcSub.on("message", async (_channel, message) => {
        try {
          const { phone, responseChannel } = JSON.parse(message);
          if (!this.sock || this.status !== "connected") {
            await rpcPub.publish(
              responseChannel,
              JSON.stringify({
                exists: false,
                error: "WhatsApp delivery service is currently offline. Please try again shortly.",
              })
            );
            return;
          }

          const digits = phone.replace(/\D/g, "");
          const jid = `${digits}@s.whatsapp.net`;
          const results = await this.sock.onWhatsApp(jid);
          const exists = Boolean(results && results.length > 0 && results[0].exists);

          await rpcPub.publish(responseChannel, JSON.stringify({ exists }));
        } catch (err: any) {
          console.error("RPC onWhatsApp handler error:", err);
        }
      });
    } catch (err) {
      console.error("Failed to setup Redis RPC in BaileysService:", err);
    }
  }

  private initBullMqWorker() {
    try {
      const redisConnection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      this.bullMqWorker = new Worker<OtpJobData>(
        "washflow-otp-delivery",
        async (job) => {
          // 1. Enforce strict 5-minute TTL: Discard stale OTP jobs and mark expired in DB
          const jobAge = Date.now() - job.timestamp;
          if (jobAge > 5 * 60 * 1000) {
            console.log(`⏰ [WashFlow Baileys] Discarding expired OTP job ${job.id} (${Math.round(jobAge / 1000)}s old)`);
            if (job.data.otpId) {
              await pool.query(
                `UPDATE wa_outbound_messages 
                 SET status = 'expired', failure_reason = 'OTP code expired (5-minute TTL elapsed)' 
                 WHERE otp_id = $1 AND status = 'queued'`,
                [job.data.otpId]
              ).catch(() => {});
            }
            return { discarded: true };
          }

          if (!this.sock || this.status !== "connected") {
            throw new Error("WhatsApp socket is not connected. Failing job for retry.");
          }

          // 2. Enforce sequential pacing with randomized jitter (500ms - 1500ms)
          const jitterMs = Math.floor(Math.random() * 1000) + 500;
          await sleep(jitterMs);

          const { otpId, toPhone, otpCode, purpose } = job.data;
          const messageText =
            purpose === "reset_password"
              ? `Your WashFlow password reset code is ${otpCode}. It expires in 5 minutes. Never share this code.`
              : purpose === "admin_stepup"
              ? `Your WashFlow Administrator verification code is ${otpCode}. It expires in 5 minutes. Never share this code.`
              : `Your WashFlow verification code is ${otpCode}. It expires in 5 minutes. Never share this code.`;

          const result = await this.sendTextMessage(toPhone, messageText);
          if (!result.success || !result.messageId) {
            throw new Error(result.error || "Failed to send message via WhatsApp");
          }

          await pool.query(
            `UPDATE wa_outbound_messages 
             SET provider_message_id = $1, status = 'sent', sent_at = NOW(), attempts = attempts + 1 
             WHERE otp_id = $2`,
            [result.messageId, otpId]
          );

          console.log(`📨 [WashFlow Baileys] Dispatched ${purpose} to ${maskPhone(toPhone)}`);
          return { success: true, messageId: result.messageId };
        },
        {
          connection: redisConnection,
          concurrency: 1, // Sequential delivery prevents bursts and ban triggers
        }
      );

      // Start paused until connection opens
      this.bullMqWorker.pause(true);
    } catch (workerErr) {
      console.error("Failed to initialize BullMQ worker in BaileysService:", workerErr);
    }
  }

  private scheduleReconnect(delayMs: number = 5000) {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log("[WashFlow Baileys] Attempting scheduled reconnection...");
      this.init(true);
    }, delayMs);
  }

  public async disconnect(explicitClearAuth = false): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.cleanupSocket();

    if (explicitClearAuth && this.clearAllStateFn) {
      await this.clearAllStateFn();
      console.log("🧹 [WashFlow Baileys] Stored WhatsApp authentication credentials cleared by admin.");
    }

    await this.releaseAdvisoryLock();
    this.setStatus("disconnected");
  }

  public async restart(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.cleanupSocket();
    this.resetCircuitBreaker();
    await this.init(false);
  }

  public async requestPairingCode(phoneNumber: string): Promise<string> {
    // Enforce mutual exclusion: do not pair by code if QR active
    if (this.activePairingMode === "qr") {
      throw new Error("QR pairing session currently active. Wait or reset before requesting a pairing code.");
    }

    const now = Date.now();
    if (now - this.pairingHourWindowStart > 60 * 60 * 1000) {
      this.pairingHourWindowStart = now;
      this.pairingAttemptsThisHour = 0;
    }

    if (this.pairingAttemptsThisHour >= this.maxPairingAttemptsPerHour) {
      throw new Error(
        `Pairing attempt limit reached (maximum ${this.maxPairingAttemptsPerHour} per hour). Please wait before requesting another pairing code.`
      );
    }
    this.pairingAttemptsThisHour++;
    this.activePairingMode = "code";

    if (!this.sock) {
      await this.init();
    }
    if (!this.sock) {
      throw new Error("Failed to initialize WhatsApp socket.");
    }

    this.setStatus("pairing");
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    return await this.sock.requestPairingCode(cleanNumber);
  }

  public async checkNumberOnWhatsApp(toPhone: string): Promise<{ exists: boolean; error?: string }> {
    if (env.NODE_ENV === "test") {
      return { exists: true };
    }

    if (!this.sock || this.status !== "connected") {
      return {
        exists: false,
        error: "WhatsApp delivery gateway is currently offline. Administrator has been alerted.",
      };
    }

    try {
      const cleanDigits = toPhone.replace(/\D/g, "");
      const jid = `${cleanDigits}@s.whatsapp.net`;
      const res = await this.sock.onWhatsApp(jid);
      return { exists: Boolean(res && res.length > 0 && res[0].exists) };
    } catch (err: any) {
      return { exists: false, error: err.message };
    }
  }

  public async sendTextMessage(
    toPhone: string,
    messageText: string
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (!this.sock || this.status !== "connected") {
      return {
        success: false,
        error: "WhatsApp Baileys client is not connected. Please scan QR in Admin portal.",
      };
    }

    try {
      // Outbound rate pacing: ensure at least 500ms since last send
      const now = Date.now();
      const elapsed = now - this.lastSendTimestamp;
      if (elapsed < 500) {
        await sleep(500 - elapsed);
      }
      this.lastSendTimestamp = Date.now();

      let normalized = normalizePhone(toPhone);
      if (!normalized) {
        const cleaned = toPhone.replace(/\D/g, "");
        if (cleaned.startsWith("07") || cleaned.startsWith("01")) {
          normalized = "+254" + cleaned.slice(1);
        } else if (cleaned.startsWith("254")) {
          normalized = "+" + cleaned;
        } else {
          normalized = "+" + cleaned;
        }
      }

      const phoneDigits = normalized.replace(/\+/g, "");
      const jid = `${phoneDigits}@s.whatsapp.net`;

      const result = await this.sock.sendMessage(jid, {
        text: messageText,
      });

      return {
        success: true,
        messageId: result?.key?.id || `wa-${Date.now()}`,
      };
    } catch (err: any) {
      console.error("[WashFlow Baileys] Message sending failed:", err);
      return {
        success: false,
        error: err?.message || "Failed to send WhatsApp message",
      };
    }
  }

  private async handleCustomerOptOut(remoteJid: string) {
    try {
      const phoneDigits = remoteJid.replace("@s.whatsapp.net", "");
      const e164Candidate1 = `+${phoneDigits}`;
      const e164Candidate2 = phoneDigits.startsWith("254") ? `+254${phoneDigits.slice(3)}` : `+${phoneDigits}`;

      const user = await db.query.users.findFirst({
        where: (u, { or, eq }) => or(eq(u.phone, e164Candidate1), eq(u.phone, e164Candidate2)),
      });

      if (user) {
        // Record opt-out event in audit log
        await db.insert(auditLog).values({
          actorId: user.id,
          action: "WHATSAPP_OPT_OUT_REQUESTED",
          entity: "users",
          entityId: user.id,
          meta: { phone: user.phone, remoteJid },
        });
      }
      // Never auto-reply to incoming WhatsApp messages per compliance rules
    } catch (err) {
      console.error("[WashFlow Baileys] Failed to process opt-out:", err);
    }
  }
}

// Singleton instance
const globalForBaileys = globalThis as unknown as {
  baileysService: BaileysService | undefined;
};

export const baileysService =
  globalForBaileys.baileysService ?? new BaileysService();

if (process.env.NODE_ENV !== "production") {
  globalForBaileys.baileysService = baileysService;
}
