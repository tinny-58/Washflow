import {
  encryptClientField,
  decryptClientField,
  computeBlindIndex,
} from "../src/lib/encryption";
import { db } from "../src/db";
import { users, clientEncryptionKeys } from "../src/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function testEncryption() {
  console.log("🔐 Testing Envelope Encryption & Blind Indexing...");

  const testClientId = crypto.randomUUID();

  // Create temporary user for foreign key constraint
  await db.insert(users).values({
    id: testClientId,
    name: "Encryption Test User",
    username: `enc_${Date.now()}`,
    phone: `+25479999${Math.floor(1000 + Math.random() * 9000)}`,
    phoneE164: `+25479999${Math.floor(1000 + Math.random() * 9000)}`,
    role: "user",
  });

  try {
    const sensitiveAddress = "Penthouse Suite 14, Riverside Drive, Nairobi";
    const sensitivePhone = "+254712345678";

    // 1. Blind Index
    const blindIndex1 = computeBlindIndex(sensitivePhone);
    const blindIndex2 = computeBlindIndex(" +254 712 345 678 "); // whitespace normalization
    console.log("Blind index 1:", blindIndex1);
    console.log("Blind index 2:", blindIndex2);

    // 2. Encrypt
    const encrypted = await encryptClientField(testClientId, sensitiveAddress);
    console.log("Encrypted string:", encrypted);

    if (!encrypted?.startsWith("enc:v1:")) {
      throw new Error("Encrypted payload does not match expected prefix 'enc:v1:'");
    }

    // 3. Decrypt
    const decrypted = await decryptClientField(testClientId, encrypted);
    console.log("Decrypted string:", decrypted);

    if (decrypted !== sensitiveAddress) {
      throw new Error(`Decrypted string does not match original! Got: ${decrypted}`);
    }

    console.log("✅ Envelope Encryption round-trip successfully verified!");
  } finally {
    await db.delete(clientEncryptionKeys).where(eq(clientEncryptionKeys.clientId, testClientId));
    await db.delete(users).where(eq(users.id, testClientId));
    console.log("✅ Zero test data remaining in database.");
  }

  process.exit(0);
}

testEncryption().catch((err) => {
  console.error("Encryption test failed:", err);
  process.exit(1);
});
