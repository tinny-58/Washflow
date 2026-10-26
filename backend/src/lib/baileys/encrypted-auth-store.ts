import crypto from "crypto";
import {
  initAuthCreds,
  BufferJSON,
  makeCacheableSignalKeyStore,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { db, pool } from "../../db";
import { waAuthState } from "../../db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { env } from "../env";

const storeLogger = pino({ level: "silent" });

// Cached 32-byte key for AES-256-GCM derived from env.BAILEYS_AUTH_KEY
let cachedKey: Buffer | null = null;
function getEncryptionKey(): Buffer {
  if (!cachedKey) {
    cachedKey = crypto.createHash("sha256").update(env.BAILEYS_AUTH_KEY).digest();
  }
  return cachedKey;
}

function encrypt(text: string): { encryptedData: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    encryptedData: encrypted,
    iv: iv.toString("hex"),
    tag,
  };
}

function decrypt(encryptedData: string, ivHex: string, tagHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function usePostgresAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAllState: () => Promise<void>;
}> {
  // 1. Load or initialize creds
  const credsRow = await db.query.waAuthState.findFirst({
    where: eq(waAuthState.id, "creds"),
  });

  let creds: AuthenticationCreds;
  if (credsRow) {
    try {
      const decrypted = decrypt(credsRow.encryptedData, credsRow.iv, credsRow.tag);
      creds = JSON.parse(decrypted, BufferJSON.reviver);
    } catch (err) {
      console.error("Failed to decrypt Baileys creds, initializing fresh creds:", err);
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    const serialized = JSON.stringify(creds, BufferJSON.replacer);
    const { encryptedData, iv, tag } = encrypt(serialized);

    await db
      .insert(waAuthState)
      .values({
        id: "creds",
        encryptedData,
        iv,
        tag,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: waAuthState.id,
        set: {
          encryptedData,
          iv,
          tag,
          updatedAt: new Date(),
        },
      });
  };

  const clearAllState = async () => {
    await db.delete(waAuthState);
  };

  const rawKeys: SignalKeyStore = {
    get: async (type, ids) => {
      const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
      if (ids.length === 0) return data;

      const keyIdMap = new Map<string, string>();
      const keyIds = ids.map((id) => {
        const fullId = `${type}:${id}`;
        keyIdMap.set(fullId, id);
        return fullId;
      });

      try {
        // Query in chunks of 200 to keep parameter counts well within limits
        for (let i = 0; i < keyIds.length; i += 200) {
          const chunk = keyIds.slice(i, i + 200);
          const rows = await db
            .select({
              id: waAuthState.id,
              encryptedData: waAuthState.encryptedData,
              iv: waAuthState.iv,
              tag: waAuthState.tag,
            })
            .from(waAuthState)
            .where(inArray(waAuthState.id, chunk));

          for (const row of rows) {
            const originalId = keyIdMap.get(row.id);
            if (!originalId) continue;
            try {
              const decrypted = decrypt(row.encryptedData, row.iv, row.tag);
              data[originalId] = JSON.parse(decrypted, BufferJSON.reviver);
            } catch (err) {
              console.error(`Failed to decrypt Baileys key ${row.id}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`Failed to bulk fetch Baileys keys of type ${type}:`, err);
      }

      return data;
    },

    set: async (data) => {
      const deleteIds: string[] = [];
      const insertRows: {
        id: string;
        encryptedData: string;
        iv: string;
        tag: string;
        updatedAt: Date;
      }[] = [];

      for (const type of Object.keys(data)) {
        const categoryData = (data as any)[type];
        for (const id of Object.keys(categoryData)) {
          const value = categoryData[id];
          const keyId = `${type}:${id}`;

          if (value === null || value === undefined) {
            deleteIds.push(keyId);
          } else {
            const serialized = JSON.stringify(value, BufferJSON.replacer);
            const { encryptedData, iv, tag } = encrypt(serialized);
            insertRows.push({
              id: keyId,
              encryptedData,
              iv,
              tag,
              updatedAt: new Date(),
            });
          }
        }
      }

      const tasks: Promise<any>[] = [];

      if (deleteIds.length > 0) {
        for (let i = 0; i < deleteIds.length; i += 100) {
          const chunk = deleteIds.slice(i, i + 100);
          tasks.push(
            db.delete(waAuthState).where(inArray(waAuthState.id, chunk)).catch((err) => {
              console.error("Failed to batch delete Baileys signal keys:", err);
            })
          );
        }
      }

      if (insertRows.length > 0) {
        for (let i = 0; i < insertRows.length; i += 100) {
          const chunk = insertRows.slice(i, i + 100);
          tasks.push(
            db
              .insert(waAuthState)
              .values(chunk)
              .onConflictDoUpdate({
                target: waAuthState.id,
                set: {
                  encryptedData: sql`excluded.encrypted_data`,
                  iv: sql`excluded.iv`,
                  tag: sql`excluded.tag`,
                  updatedAt: sql`excluded.updated_at`,
                },
              })
              .catch((err) => {
                console.error("Failed to batch save Baileys signal keys:", err);
              })
          );
        }
      }

      await Promise.all(tasks);
    },
  };

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(rawKeys, storeLogger),
    },
    saveCreds,
    clearAllState,
  };
}
