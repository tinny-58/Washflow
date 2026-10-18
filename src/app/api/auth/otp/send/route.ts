import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/db";
import { otpVerifications, users } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/security";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";

const sendOtpSchema = z.object({
  phone: z.string().min(5).max(20),
  // Honeypot field - must be empty
  website: z.string().max(0, "Bot detected").optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = sendOtpSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { phone: rawPhone, website } = parseResult.data;

    // 1. Honeypot check
    if (website && website.length > 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 2. Validate and normalize phone number
    const normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Please enter a valid mobile phone number (e.g., 0712345678 or +254712345678)" },
        { status: 422 }
      );
    }

    // 3. Rate limiting checks
    const clientIp = await getClientIp();

    // IP limit (10 requests/min)
    const ipLimit = await checkRateLimit(
      `ratelimit:ip:${clientIp}`,
      env.RATE_LIMIT_IP_PER_MIN,
      60
    );
    if (!ipLimit.success) {
      return rateLimitExceededResponse(ipLimit.resetSeconds);
    }

    // Per-phone OTP limit (5 requests/hour)
    const phoneLimit = await checkRateLimit(
      `ratelimit:otp:phone:${normalizedPhone}`,
      env.RATE_LIMIT_OTP_PER_HOUR,
      3600
    );
    if (!phoneLimit.success) {
      return rateLimitExceededResponse(
        phoneLimit.resetSeconds,
        "Too many OTP requests for this number. Please wait before trying again."
      );
    }

    // 4. Check if phone is blocked
    const existingUser = await db.query.users.findFirst({
      where: eq(users.phone, normalizedPhone),
    });
    if (existingUser?.isBlocked) {
      return NextResponse.json(
        { error: "This phone number has been suspended from using the service." },
        { status: 403 }
      );
    }

    // 5. Generate 6-digit OTP
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const codeHash = crypto
      .createHmac("sha256", env.SESSION_SECRET)
      .update(rawCode)
      .digest("hex");

    const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Save to otp_verifications
    await db.insert(otpVerifications).values({
      phone: normalizedPhone,
      codeHash,
      attempts: 0,
      expiresAt,
    });

    // 6. Deliver OTP
    // In development or demo mode, log the code prominently for easy testing
    console.log(`\n========================================`);
    console.log(`📲 [WashFlow OTP] To: ${normalizedPhone}`);
    console.log(`🔑 Verification Code: ${rawCode}`);
    console.log(`⏳ Valid for ${env.OTP_EXPIRY_MINUTES} minutes`);
    console.log(`========================================\n`);

    return NextResponse.json({
      success: true,
      phone: normalizedPhone,
      message: "Verification code sent successfully",
      expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
      // Provide devCode in development for seamless automated testing and demo convenience
      ...(env.NODE_ENV !== "production" ? { devCode: rawCode } : {}),
    });
  } catch (error) {
    console.error("OTP send error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code. Please try again." },
      { status: 500 }
    );
  }
}
