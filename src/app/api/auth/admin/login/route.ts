import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "@/db";
import { users, auditLog } from "@/db/schema";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/security";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { verifyTotpToken } from "@/lib/totp";
import { eq } from "drizzle-orm";

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  totpCode: z.string().length(6).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = adminLoginSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid login credentials", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password, totpCode } = parseResult.data;
    const clientIp = await getClientIp();

    // Stricter rate limiting on admin login: max 5 attempts per 15 minutes
    const rateCheck = await checkRateLimit(`ratelimit:admin:login:${clientIp}`, 5, 900);
    if (!rateCheck.success) {
      return rateLimitExceededResponse(
        rateCheck.resetSeconds,
        "Too many admin login attempts. Account temporarily locked. Please try again later."
      );
    }

    // Find admin user
    const adminUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase().trim()),
    });

    if (!adminUser || adminUser.role !== "admin" || !adminUser.passwordHash) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Verify Argon2 password hash
    const passwordValid = await argon2.verify(adminUser.passwordHash, password);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Verify TOTP 2FA if configured
    if (adminUser.totpSecret) {
      if (!totpCode) {
        return NextResponse.json(
          { error: "Two-factor authentication code required.", requiresTotp: true },
          { status: 403 }
        );
      }

      const totpValid = verifyTotpToken(totpCode, adminUser.totpSecret);
      if (!totpValid) {
        return NextResponse.json(
          { error: "Invalid two-factor authentication code.", requiresTotp: true },
          { status: 401 }
        );
      }
    }

    // Create Admin session token (8 hours)
    const sessionToken = createSessionToken(
      {
        userId: adminUser.id,
        name: adminUser.name,
        email: adminUser.email || "",
        role: "admin",
      },
      60 * 60 * 8 // 8 hours
    );

    // Audit log
    await db.insert(auditLog).values({
      actorId: adminUser.id,
      action: "ADMIN_LOGGED_IN",
      entity: "users",
      entityId: adminUser.id,
      meta: { ip: clientIp, email: adminUser.email },
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
    });

    setSessionCookie(response.headers, sessionToken, 60 * 60 * 8);
    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Authentication failed. Please try again." },
      { status: 500 }
    );
  }
}
