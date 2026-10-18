import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/db";
import { otpVerifications, users, auditLog } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { sanitizeText } from "@/lib/sanitization";
import {
  getClientIp,
  getDeviceFingerprint,
  setDeviceCookie,
  checkDeviceAccountLimit,
} from "@/lib/security";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rate-limiter";
import { env } from "@/lib/env";
import { eq, and, isNull, desc } from "drizzle-orm";

const verifyOtpSchema = z.object({
  phone: z.string().min(5).max(20),
  code: z.string().length(6, "Code must be exactly 6 digits"),
  name: z.string().min(2, "Name must be at least 2 characters").max(60).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = verifyOtpSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { phone: rawPhone, code, name } = parseResult.data;
    const normalizedPhone = normalizePhone(rawPhone);

    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number format." }, { status: 422 });
    }

    // 1. Rate limiting on verify attempts
    const clientIp = await getClientIp();
    const rateCheck = await checkRateLimit(`ratelimit:otp:verify:${clientIp}`, 15, 60);
    if (!rateCheck.success) {
      return rateLimitExceededResponse(rateCheck.resetSeconds);
    }

    // 2. Fetch the latest active OTP token for this phone
    const otpRecords = await db
      .select()
      .from(otpVerifications)
      .where(and(eq(otpVerifications.phone, normalizedPhone), isNull(otpVerifications.verifiedAt)))
      .orderBy(desc(otpVerifications.createdAt))
      .limit(1);

    const latestOtp = otpRecords[0];

    if (!latestOtp) {
      return NextResponse.json(
        { error: "No active verification code found. Please request a new code." },
        { status: 404 }
      );
    }

    // Check expiration
    if (new Date() > latestOtp.expiresAt) {
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new code." },
        { status: 410 }
      );
    }

    // Check abuse limit: Max 2 failed OTP attempts before invalidation
    if (latestOtp.attempts >= env.MAX_OTP_ATTEMPTS) {
      return NextResponse.json(
        { error: "Verification code has been invalidated due to too many failed attempts. Please request a new code." },
        { status: 429 }
      );
    }

    // 3. Verify the submitted code against codeHash
    const expectedHash = crypto
      .createHmac("sha256", env.SESSION_SECRET)
      .update(code.trim())
      .digest("hex");

    const hashMatch = crypto.timingSafeEqual(
      Buffer.from(expectedHash),
      Buffer.from(latestOtp.codeHash)
    );

    if (!hashMatch) {
      const nextAttempts = latestOtp.attempts + 1;
      await db
        .update(otpVerifications)
        .set({ attempts: nextAttempts })
        .where(eq(otpVerifications.id, latestOtp.id));

      const attemptsRemaining = Math.max(0, env.MAX_OTP_ATTEMPTS - nextAttempts);
      return NextResponse.json(
        {
          error:
            attemptsRemaining > 0
              ? `Incorrect verification code. ${attemptsRemaining} attempt(s) remaining.`
              : "Too many failed attempts. This code is now invalidated. Please request a new code.",
          attemptsRemaining,
        },
        { status: 400 }
      );
    }

    // Mark OTP as verified
    await db
      .update(otpVerifications)
      .set({ verifiedAt: new Date() })
      .where(eq(otpVerifications.id, latestOtp.id));

    // 4. Device Fingerprint & Abuse check
    const { fingerprint, rawDeviceId, isNewCookie } = await getDeviceFingerprint();

    // Check if user already exists
    let user = await db.query.users.findFirst({
      where: eq(users.phone, normalizedPhone),
    });

    if (!user) {
      // New user registration
      // Enforce max 2 accounts per device fingerprint
      const deviceAllowed = await checkDeviceAccountLimit(fingerprint);
      if (!deviceAllowed) {
        return NextResponse.json(
          {
            error:
              "Account creation limit reached for this device. WashFlow allows a maximum of 2 accounts per device.",
          },
          { status: 403 }
        );
      }

      const cleanName = sanitizeText(name) || "Customer";
      const [newUser] = await db
        .insert(users)
        .values({
          name: cleanName,
          phone: normalizedPhone,
          role: "customer",
          phoneVerifiedAt: new Date(),
          deviceFingerprint: fingerprint,
        })
        .returning();

      user = newUser;

      await db.insert(auditLog).values({
        actorId: user.id,
        action: "CUSTOMER_REGISTERED",
        entity: "users",
        entityId: user.id,
        meta: { phone: normalizedPhone, fingerprint },
      });
    } else {
      // Existing user login
      if (user.isBlocked) {
        return NextResponse.json(
          { error: "Your account has been suspended. Please contact support." },
          { status: 403 }
        );
      }

      await db
        .update(users)
        .set({
          phoneVerifiedAt: new Date(),
          deviceFingerprint: fingerprint,
        })
        .where(eq(users.id, user.id));
    }

    // 5. Create Session & Set Cookies
    const sessionToken = createSessionToken({
      userId: user.id,
      name: user.name,
      phone: user.phone,
      role: "customer",
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });

    setSessionCookie(response.headers, sessionToken);
    if (isNewCookie) {
      setDeviceCookie(response.headers, rawDeviceId);
    }

    return response;
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
