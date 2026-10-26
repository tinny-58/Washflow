import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import readline from "readline";
import { pool, db } from "../src/db";
import { otpCodes, waOutboundMessages } from "../src/db/schema";
import { eq, desc } from "drizzle-orm";
import { normalizePhoneNumber } from "../src/lib/validation";
import { createAndStoreOtp, verifyAndConsumeOtp } from "../src/lib/otp";
import { checkNumberOnWhatsApp } from "../src/lib/baileys/queue";
import { maskPhone } from "../src/lib/otp/delivery-provider";

function promptQuestion(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log("=======================================================");
  console.log("📱 WASHFLOW LIVE WHATSAPP OTP VERIFICATION UTILITY");
  console.log("=======================================================");
  console.log("This utility tests live end-to-end delivery of WhatsApp OTP codes");
  console.log("using your connected Baileys worker process.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const rawInput = await promptQuestion(
      rl,
      "Enter your real WhatsApp phone number (e.g., 0712345678 or +254712345678): "
    );

    const norm = normalizePhoneNumber(rawInput.trim());
    if (!norm.valid || !norm.e164) {
      console.error(`\n❌ Error: ${norm.error || "Invalid phone number."}`);
      rl.close();
      await pool.end();
      process.exit(1);
    }

    const e164 = norm.e164;
    console.log(`\n🔍 Checking if ${maskPhone(e164)} exists on WhatsApp network...`);

    const waCheck = await checkNumberOnWhatsApp(e164);
    if (!waCheck.exists) {
      console.error(
        `\n❌ WhatsApp Check: Number is not registered on WhatsApp (${waCheck.error || "not on WhatsApp"}).`
      );
      rl.close();
      await pool.end();
      process.exit(1);
    }

    console.log("✅ Verified: Destination number exists on WhatsApp!");

    console.log("\n🚀 Generating CSPRNG OTP and enqueuing delivery via Baileys worker...");
    const otpResult = await createAndStoreOtp({
      e164Phone: e164,
      purpose: "signup",
      clientIp: "127.0.0.1",
      sessionBindingId: `live_cli_${Date.now()}`,
    });

    if (!otpResult.success || !otpResult.otpId) {
      console.error(`\n❌ Failed to dispatch OTP: ${otpResult.error}`);
      rl.close();
      await pool.end();
      process.exit(1);
    }

    console.log(`✅ OTP record created with ID: ${otpResult.otpId}`);
    console.log("⏳ Awaiting delivery receipt from WhatsApp network...\n");

    // Poll message status for up to 30 seconds
    let delivered = false;
    for (let i = 0; i < 15; i++) {
      const msg = await db.query.waOutboundMessages.findFirst({
        where: eq(waOutboundMessages.otpId, otpResult.otpId),
      });

      if (msg) {
        if (msg.status === "sent" || msg.status === "delivered" || msg.status === "read") {
          console.log(`📬 Message Status: [${msg.status.toUpperCase()}]`);
          delivered = true;
          break;
        } else if (msg.status === "failed") {
          console.error(`❌ Message Delivery Failed: ${msg.failureReason || "Unknown reason"}`);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!delivered) {
      console.log("ℹ️ Delivery is queued or being processed by the Baileys worker.");
      console.log("   (Ensure your standalone worker is running: npx tsx scripts/baileys-worker.ts)");
    }

    console.log("\n-------------------------------------------------------");
    const enteredCode = await promptQuestion(
      rl,
      "Enter the 6-digit verification code you received on WhatsApp: "
    );

    rl.close();

    console.log("\n🔒 Verifying code against PostgreSQL HMAC hash with timing-safe comparison...");
    const verifyResult = await verifyAndConsumeOtp({
      e164Phone: e164,
      code: enteredCode.trim(),
      purpose: "signup",
      sessionBindingId: `live_cli_${Date.now()}`,
    });

    if (!verifyResult.success || !verifyResult.verificationToken) {
      console.error(`\n❌ Verification Failed: ${verifyResult.error}`);
      console.error("   The code was either incorrect, expired, or already consumed.");
      await pool.end();
      process.exit(1);
    }

    console.log("\n🎉 SUCCESS! Live OTP Verification Passed!");
    console.log(`🔑 Single-use verification token issued: ${verifyResult.verificationToken.slice(0, 16)}...`);
    console.log("🔒 Code atomically consumed in PostgreSQL database.");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  } finally {
    await pool.end();
  }
}

main();
