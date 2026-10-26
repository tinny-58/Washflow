import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import readline from "readline";
import { pool, db } from "../src/db";
import { users, auditLog } from "../src/db/schema";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import {
  validatePasswordNist,
  normalizePhoneNumber,
  validateEmailFormat,
} from "../src/lib/validation";

function promptQuestion(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(query);
    const stdin = process.stdin;
    const oldRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let password = "";
    const onData = (ch: Buffer) => {
      const char = ch.toString("utf8");
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(oldRaw);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(password);
      } else if (char === "\u0003") {
        // Ctrl+C
        process.exit(1);
      } else if (char === "\b" || char === "\x7f") {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        password += char;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

async function main() {
  console.log("=======================================================");
  console.log("👑 WASHFLOW PRODUCTION ADMIN CREATION UTILITY");
  console.log("=======================================================\n");

  const isForce = process.argv.includes("--force");

  // Check if admin already exists
  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.role, "admin"),
  });

  if (existingAdmin && !isForce) {
    console.error(
      `❌ Error: An administrator account already exists (${existingAdmin.email}).`
    );
    console.error(
      "To overwrite or update the existing admin, re-run with --force:\n  npx tsx scripts/create-admin.ts --force\n"
    );
    await pool.end();
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    let email = "";
    while (!email) {
      const input = await promptQuestion(rl, "Enter Admin Email: ");
      const val = validateEmailFormat(input);
      if (val.valid && val.cleanEmail) {
        email = val.cleanEmail;
      } else {
        console.log(`❌ Invalid email: ${val.error}. Please try again.`);
      }
    }

    let phoneE164 = "";
    while (!phoneE164) {
      const input = await promptQuestion(
        rl,
        "Enter Admin WhatsApp Phone (e.g. +254712345678 or 0712345678): "
      );
      const val = normalizePhoneNumber(input);
      if (val.valid && val.e164) {
        phoneE164 = val.e164;
      } else {
        console.log(`❌ Invalid phone number: ${val.error}. Please try again.`);
      }
    }

    const adminName = (await promptQuestion(rl, "Enter Admin Display Name (default: WashFlow Operations): ")).trim() || "WashFlow Operations";

    rl.close();

    let password = "";
    while (!password) {
      const passInput = await promptHidden("Enter Admin Password (min 10 chars, not breached): ");
      const val = await validatePasswordNist(passInput);
      if (!val.valid) {
        console.log(`❌ Password does not meet security requirements: ${val.error}`);
        continue;
      }

      const confirmInput = await promptHidden("Confirm Admin Password: ");
      if (passInput !== confirmInput) {
        console.log("❌ Passwords do not match. Please try again.");
        continue;
      }

      password = passInput;
    }

    console.log("\n🔒 Hashing password with Argon2id...");
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    if (existingAdmin && isForce) {
      console.log(`🔄 Updating existing admin account (ID: ${existingAdmin.id})...`);
      await db
        .update(users)
        .set({
          name: adminName,
          username: "admin",
          email,
          phone: phoneE164,
          phoneE164,
          passwordHash,
          role: "admin",
          phoneVerifiedAt: new Date(),
          isBlocked: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingAdmin.id));

      await db.insert(auditLog).values({
        actorId: existingAdmin.id,
        action: "ADMIN_CREDENTIALS_UPDATED_VIA_CLI",
        entity: "users",
        entityId: existingAdmin.id,
        meta: { email, phoneE164 },
      });

      console.log("✅ Admin credentials updated successfully!");
    } else {
      console.log("✨ Creating new admin user in PostgreSQL...");
      const [newAdmin] = await db
        .insert(users)
        .values({
          name: adminName,
          username: "admin",
          email,
          phone: phoneE164,
          phoneE164,
          passwordHash,
          role: "admin",
          phoneVerifiedAt: new Date(),
          isBlocked: false,
        })
        .returning();

      await db.insert(auditLog).values({
        actorId: newAdmin.id,
        action: "ADMIN_CREDENTIALS_CREATED_VIA_CLI",
        entity: "users",
        entityId: newAdmin.id,
        meta: { email, phoneE164 },
      });

      console.log("✅ Admin user created successfully!");
    }

    console.log("\n=======================================================");
    console.log("👑 ADMIN ACCOUNT READY");
    console.log("=======================================================");
    console.log(`📧 Email:           ${email}`);
    console.log(`📱 WhatsApp Phone:  ${phoneE164}`);
    console.log(`🛡️ Role:            admin`);
    console.log(`🔑 Password:        [STORED SECURELY IN ARGON2ID]`);
    console.log("=======================================================\n");
  } catch (err) {
    console.error("❌ Failed to set up admin:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
