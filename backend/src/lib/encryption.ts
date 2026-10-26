import crypto from "crypto";
import { db } from "../db";
import { clientEncryptionKeys } from "../db/schema";
import { eq } from "drizzle-orm";
import { env } from "./env";

// Master Key (KEK) derived from ENCRYPTION_MASTER_KEY or SESSION_SECRET
const MASTER_KEY_SEED = process.env.ENCRYPTION_MASTER_KEY || env.SESSION_SECRET || "washflow-master-envelope-key-32b-secret";
const MASTER_KEY = crypto.createHash("sha256").update(MASTER_KEY_SEED).digest(); // 32 bytes

// Blind Index Salt
const BLIND_INDEX_SALT = crypto
  .createHash("sha256")
  .update(`${MASTER_KEY_SEED}:blind-index-salt`)
  .digest();

// In-memory LRU or cache for unwrapped client DEKs
const dekCache = new Map<string, Buffer>();

/**
 * Computes a deterministic HMAC blind index for exact-match lookups (e.g. phone uniqueness)
 * without revealing the underlying plaintext.
 */
export function computeBlindIndex(value: string): string {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  return crypto.createHmac("sha256", BLIND_INDEX_SALT).update(normalized).digest("hex");
}

/**
 * Gets or creates the per-client Data Encryption Key (DEK).
 * The DEK is encrypted using AES-256-GCM under the master KEK before storage in client_encryption_keys.
 */
export async function getClientDek(clientId: string): Promise<Buffer> {
  const cached = dekCache.get(clientId);
  if (cached) return cached;

  // 1. Check if client key exists in DB
  const existing = await db.query.clientEncryptionKeys.findFirst({
    where: eq(clientEncryptionKeys.clientId, clientId),
  });

  if (existing) {
    try {
      // Un-wrap DEK using stored IV, tag, and ciphertext
      const iv = Buffer.from(existing.iv, "base64");
      const authTag = Buffer.from(existing.tag, "base64");
      const ciphertext = Buffer.from(existing.encryptedDek, "base64");

      const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY, iv);
      decipher.setAuthTag(authTag);
      const unwrapped = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      dekCache.set(clientId, unwrapped);
      return unwrapped;
    } catch (err) {
      console.error(`Failed to unwrap encryption key for client ${clientId}:`, err);
      throw new Error("Client key decryption failed.");
    }
  }

  // 2. Generate new 256-bit DEK
  const newDek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(newDek), cipher.final()]);
  const authTag = cipher.getAuthTag();

  await db.insert(clientEncryptionKeys).values({
    clientId,
    encryptedDek: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
    keyVersion: 1,
  });

  dekCache.set(clientId, newDek);
  return newDek;
}

/**
 * Encrypts a client field with their personal DEK using AES-256-GCM.
 * Output format: "enc:v1:<base64-encoded [12 bytes IV][16 bytes AuthTag][Ciphertext]>"
 */
export async function encryptClientField(
  clientId: string,
  plaintext?: string | null
): Promise<string | null> {
  if (plaintext === undefined || plaintext === null || plaintext === "") {
    return plaintext ?? null;
  }

  // If already encrypted, return as is
  if (typeof plaintext === "string" && plaintext.startsWith("enc:v1:")) {
    return plaintext;
  }

  const dek = await getClientDek(clientId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");
  return `enc:v1:${payload}`;
}

/**
 * Decrypts a client field using their personal DEK.
 * If data is not encrypted (plain string), gracefully returns the string.
 */
export async function decryptClientField(
  clientId: string,
  ciphertext?: string | null
): Promise<string | null> {
  if (!ciphertext || typeof ciphertext !== "string") {
    return ciphertext ?? null;
  }

  if (!ciphertext.startsWith("enc:v1:")) {
    // Legacy plaintext
    return ciphertext;
  }

  try {
    const rawPayload = Buffer.from(ciphertext.slice("enc:v1:".length), "base64");
    const iv = rawPayload.subarray(0, 12);
    const authTag = rawPayload.subarray(12, 28);
    const encrypted = rawPayload.subarray(28);

    const dek = await getClientDek(clientId);
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    console.error(`Decryption failed for client ${clientId}:`, err);
    return "[Encrypted Data]";
  }
}
