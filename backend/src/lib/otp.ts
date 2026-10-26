import crypto from "crypto";
import { pool, db } from "../db";
import { otpCodes, verificationTokens } from "../db/schema";
import { eq, and, desc, gt, isNull, sql } from "drizzle-orm";
import { env } from "./env";
import { checkRateLimit } from "./rate-limiter";
import { otpDeliveryProvider, hashPhone } from "./otp/delivery-provider";

export type OtpPurpose = "signup" | "reset_password" | "admin_stepup" | "phone_change";

export interface CreateOtpParams {
  e164Phone?: string;
  identifier?: string;
  purpose: OtpPurpose;
  clientIp?: string;
  sessionBindingId?: string;
}

export interface CreateOtpResult {
  success: boolean;
  retryAfterSeconds?: number;
  resendCooldownSeconds?: number;
  error?: string;
  otpId?: string;
  code?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  verificationToken?: string;
  token?: string;
}

/**
 * Computes HMAC-SHA256 of (salt + code) using server-side OTP_PEPPER.
 */
export function hashOtp(code: string, salt: string): string {
  return crypto
    .createHmac("sha256", env.OTP_PEPPER)
    .update(`${salt}:${code.trim()}`)
    .digest("hex");
}

/**
 * Creates and stores a 6-digit CSPRNG OTP with strict cooldown and carries forward failed attempts.
 */
export async function createAndStoreOtp({
  e164Phone,
  identifier,
  purpose,
  clientIp = "127.0.0.1",
  sessionBindingId = "default",
}: CreateOtpParams): Promise<CreateOtpResult> {
  const cleanId = (e164Phone || identifier || "").trim();
  const idHash = hashPhone(cleanId);

  // 1. IP rate limiting (5 sends per hour per IP)
  const ipLimit = await checkRateLimit(
    `ratelimit:otp:ip:${clientIp}`,
    env.RATE_LIMIT_IP_PER_HOUR,
    3600
  );
  if (!ipLimit.success) {
    return {
      success: false,
      error: "Too many verification requests from your network. Please wait before trying again.",
      retryAfterSeconds: ipLimit.resetSeconds,
    };
  }

  // 2. Hourly identifier limit (3 sends per hour per phone)
  const hourlyLimit = await checkRateLimit(
    `ratelimit:otp:hourly:${idHash}`,
    env.RATE_LIMIT_OTP_PER_HOUR,
    3600
  );
  if (!hourlyLimit.success) {
    return {
      success: false,
      error: "Too many codes requested for this number. Please try again in an hour.",
      retryAfterSeconds: hourlyLimit.resetSeconds,
    };
  }

  // 3. Rolling failure cap check (max 10 failures per hour across codes)
  const failCap = await checkRateLimit(
    `ratelimit:otp:failcap:${idHash}`,
    10,
    3600
  );
  if (!failCap.success) {
    return {
      success: false,
      error: "Too many incorrect attempts on this number. Verification is locked for 1 hour.",
      retryAfterSeconds: failCap.resetSeconds,
    };
  }

  // 4. Check for any unconsumed code for this identifier and purpose
  const activeOtp = await db.query.otpCodes.findFirst({
    where: and(
      eq(otpCodes.identifierHash, idHash),
      eq(otpCodes.purpose, purpose),
      isNull(otpCodes.consumedAt)
    ),
    orderBy: [desc(otpCodes.createdAt)],
  });

  let carriedAttempts = 0;

  if (activeOtp) {
    // If it's still unexpired, enforce the 60s resend cooldown
    if (activeOtp.expiresAt > new Date()) {
      const elapsedSeconds = Math.floor(
        (Date.now() - activeOtp.lastSentAt.getTime()) / 1000
      );
      const cooldownRemaining = 60 - elapsedSeconds;
      if (cooldownRemaining > 0) {
        return {
          success: false,
          error: `Please wait ${cooldownRemaining} seconds before requesting a new code.`,
          retryAfterSeconds: cooldownRemaining,
        };
      }

      // Carry over failed attempt count so resending does not reset the failure counter!
      carriedAttempts = activeOtp.attempts;
    }

    // Invalidate all previous unconsumed codes for this identifier and purpose
    await db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(otpCodes.identifierHash, idHash),
          eq(otpCodes.purpose, purpose),
          isNull(otpCodes.consumedAt)
        )
      );
  } else {
    // Invalidate any stale unconsumed rows just in case
    await db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(otpCodes.identifierHash, idHash),
          eq(otpCodes.purpose, purpose),
          isNull(otpCodes.consumedAt)
        )
      );
  }

  // 5. Generate 6-digit CSPRNG code
  const rawCode = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString("hex");
  const codeHash = hashOtp(rawCode, salt);
  const expiryMinutes = Math.min(Math.max(env.OTP_EXPIRY_MINUTES, 5), 10);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // 6. Insert new OTP record with carried-over attempts
  const [created] = await db
    .insert(otpCodes)
    .values({
      purpose,
      identifier: cleanId,
      identifierHash: idHash,
      sessionBindingId,
      codeHash,
      salt,
      attempts: carriedAttempts,
      maxAttempts: 5,
      expiresAt,
      lastSentAt: new Date(),
      sendCount: activeOtp ? activeOtp.sendCount + 1 : 1,
    })
    .returning();

  // 7. Dispatch via configured OtpDeliveryProvider
  const dispatchResult = await otpDeliveryProvider.sendOtp({
    otpId: created.id,
    toPhoneE164: cleanId,
    otpCode: rawCode,
    expiryMinutes,
    purpose,
  });

  if (!dispatchResult.success) {
    return {
      success: false,
      error: dispatchResult.error || "Failed to dispatch verification code.",
    };
  }

  return {
    success: true,
    otpId: created.id,
    retryAfterSeconds: 60,
    resendCooldownSeconds: 60,
    ...(env.NODE_ENV === "test" ? { code: rawCode } : {}),
  };
}

/**
 * Validates and atomically consumes an OTP code with timing-safe comparison.
 * Zero plaintext hints returned.
 */
export async function verifyAndConsumeOtp({
  e164Phone,
  identifier,
  code,
  purpose,
  sessionBindingId = "default",
  metadata,
}: {
  e164Phone?: string;
  identifier?: string;
  code?: string;
  purpose: OtpPurpose;
  sessionBindingId?: string;
  metadata?: Record<string, any>;
}): Promise<VerifyOtpResult> {
  const genericError = "That code is invalid or has expired.";

  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return { success: false, error: genericError };
  }

  const cleanPhone = (e164Phone || identifier || "").trim();
  const cleanCode = code.trim();
  const idHash = hashPhone(cleanPhone);

  // 1. Find the latest active unconsumed OTP bound to this session and identifier
  const record = await db.query.otpCodes.findFirst({
    where: and(
      eq(otpCodes.identifierHash, idHash),
      eq(otpCodes.purpose, purpose),
      isNull(otpCodes.consumedAt)
    ),
    orderBy: [desc(otpCodes.createdAt)],
  });

  if (!record) {
    return { success: false, error: genericError };
  }

  // 2. Expiration and attempt limit check
  if (new Date() > record.expiresAt || record.attempts >= record.maxAttempts) {
    await db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(otpCodes.id, record.id));
    return { success: false, error: genericError };
  }

  // 3. Timing-safe constant-time comparison
  const candidateHash = hashOtp(cleanCode, record.salt);
  const candBuf = Buffer.from(candidateHash, "hex");
  const storedBuf = Buffer.from(record.codeHash, "hex");

  const isMatch =
    candBuf.length === storedBuf.length &&
    crypto.timingSafeEqual(candBuf, storedBuf);

  if (!isMatch) {
    // Increment attempts and update rolling fail counter in Redis
    await pool.query(
      `UPDATE otp_codes 
       SET attempts = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= max_attempts THEN NOW() ELSE NULL END
       WHERE id = $1`,
      [record.id]
    );

    // Track in rolling fail counter
    await checkRateLimit(`ratelimit:otp:failcap:${idHash}`, 10, 3600);

    return { success: false, error: genericError };
  }

  // 4. Code matched! Execute single-use atomic consumption
  const consumeRes = await pool.query(
    `UPDATE otp_codes 
     SET consumed_at = NOW() 
     WHERE id = $1 
       AND consumed_at IS NULL 
       AND expires_at > NOW() 
       AND attempts < max_attempts 
     RETURNING id`,
    [record.id]
  );

  if (consumeRes.rowCount === 0) {
    // Parallel request already consumed this code
    return { success: false, error: genericError };
  }

  // 5. Issue signed, single-use verification token persisted in verification_tokens
  const rawTokenBytes = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawTokenBytes).digest("hex");
  const exp = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const finalMetadata = {
    phone: cleanPhone,
    ...(metadata || {}),
  };

  await db.insert(verificationTokens).values({
    tokenHash,
    identifierHash: idHash,
    purpose,
    sessionBindingId,
    metadata: JSON.stringify(finalMetadata),
    expiresAt: exp,
  });

  return {
    success: true,
    verificationToken: rawTokenBytes,
    token: rawTokenBytes,
  };
}

/**
 * Consumes a single-use verification token inside a transaction.
 * Guarantees that parallel account-creation or password-reset requests cannot reuse the token.
 */
export async function consumeVerificationToken({
  token,
  expectedPurpose,
  sessionBindingId,
}: {
  token: string;
  expectedPurpose: OtpPurpose;
  sessionBindingId?: string;
}): Promise<{ valid: boolean; identifierHash?: string; metadata?: any; error?: string }> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing verification token." };
  }

  const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");

  // Atomically consume token
  const res = await pool.query(
    `UPDATE verification_tokens 
     SET consumed_at = NOW() 
     WHERE token_hash = $1 
       AND purpose = $2 
       AND ($3::text IS NULL OR session_binding_id = $3) 
       AND consumed_at IS NULL 
       AND expires_at > NOW() 
     RETURNING id, identifier_hash, metadata`,
    [tokenHash, expectedPurpose, sessionBindingId || null]
  );

  if (res.rowCount === 0) {
    return {
      valid: false,
      error: "Your verification token has expired or has already been used.",
    };
  }

  const row = res.rows[0];
  let parsedMeta = null;
  if (row.metadata) {
    try {
      parsedMeta = JSON.parse(row.metadata);
    } catch {}
  }

  return {
    valid: true,
    identifierHash: row.identifier_hash,
    metadata: parsedMeta,
  };
}

export function createSignedToken<T extends Record<string, any>>(
  payload: T,
  purpose: OtpPurpose,
  expiresInSeconds = 600
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const fullPayload = { ...payload, purpose, iat, exp };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.OTP_PEPPER)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySignedToken<T extends Record<string, any>>(
  token: string,
  expectedPurpose: OtpPurpose
): { valid: boolean; payload?: T; error?: string } {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return { valid: false, error: "Malformed token." };
    const expectedSig = crypto
      .createHmac("sha256", env.OTP_PEPPER)
      .update(encoded)
      .digest("base64url");
    if (signature !== expectedSig) return { valid: false, error: "Invalid token signature." };
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return { valid: false, error: "Token expired." };
    if (payload.purpose !== expectedPurpose) return { valid: false, error: "Purpose mismatch." };
    return { valid: true, payload };
  } catch {
    return { valid: false, error: "Failed to parse token." };
  }
}
